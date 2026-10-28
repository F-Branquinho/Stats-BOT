const { ErroLimite, ErroOrcamento, ErroPerfil } = require('./leetify');
const { converterPartida } = require('./faceit');

const INTERVALO_MS = 2000;
const DIA_MS = 24 * 60 * 60 * 1000;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function antigo(iso, agora) {
    return !iso || agora.getTime() - new Date(iso).getTime() >= DIA_MS;
}

/**
 * Fetches new matches of every linked player from Leetify, and from FACEIT when there is a FACEIT client
 * (for the FACEIT matches Leetify doesn't have), and stores them.
 * `esperar` and `agora` are injectable for tests.
 */
function criarRecolha({ db, leetify, faceit = null, esperar = dormir, agora = () => new Date() }) {
    let ultimaRecolha = null;
    let emPausaAte = null;
    let orcamentoEsgotado = false;
    let emCurso = null;

    // Waits between requests, but not before the first one of a run
    function ritmo() {
        let primeiro = true;
        return async (pedido) => {
            if (!primeiro) await esperar(INTERVALO_MS);
            primeiro = false;
            return pedido();
        };
    }

    /**
     * FACEIT matches of one player that aren't stored yet (Leetify's version wins when it has one), plus their
     * FACEIT level and ELO once a day. Errors are logged and never stop the run. Returns how many were new.
     */
    async function recolherFaceit(jogador, pedir, statsDaRecolha) {
        if (!faceit) return 0;
        const s = jogador.steam64_id;
        try {
            let faceitId = jogador.faceit_id;
            if (faceitId === null || faceitId === undefined || antigo(jogador.faceit_at, agora())) {
                const quando = agora().toISOString();
                const conta = await pedir(() => faceit.jogador(s));
                faceitId = conta?.playerId ?? '';
                db.marcarFaceit(s, faceitId, quando);
                if (conta) {
                    db.guardarFaceitRank(s, conta);
                    db.guardarRank(s, quando, { faceitElo: conta.elo });
                }
            }
            if (!faceitId) return 0;

            let novas = 0;
            for (const item of await pedir(() => faceit.historico(faceitId))) {
                if (db.temJogadorNaPartidaFaceit(item.match_id, s)) continue;
                // Friends in the same match share one stats request per run
                if (!statsDaRecolha.has(item.match_id)) statsDaRecolha.set(item.match_id, await pedir(() => faceit.stats(item.match_id)));
                const convertida = converterPartida(item, statsDaRecolha.get(item.match_id), faceitId, s);
                if (convertida && db.guardarPartida(convertida.match, convertida.stats)) novas++;
            }
            return novas;
        } catch (error) {
            console.error(`❌ Could not fetch FACEIT matches of ${s}:`, error.message);
            return 0;
        }
    }

    /** Leetify, then FACEIT, for one player. `saltarLeetify` when their Leetify profile was missing less than a day ago. */
    async function recolher(jogador, pedir, { saltarLeetify = false, statsDaRecolha = new Map() } = {}) {
        const novas = saltarLeetify ? 0 : await recolherLeetify(jogador, pedir);
        return novas + await recolherFaceit(jogador, pedir, statsDaRecolha);
    }

    /** Fetches one player's Leetify matches (and their profile once a day). Returns how many were new. */
    async function recolherLeetify(jogador, pedir) {
        const s = jogador.steam64_id;
        try {
            const partidas = await pedir(() => leetify.partidas(s));
            let novas = 0;
            for (const m of partidas) {
                for (const stats of m.stats) if (db.guardarPartida(m, stats)) novas++;
            }
            const quando = agora().toISOString();
            db.marcarEstado(s, 'ok');
            db.marcarRecolha(s, quando);
            if (antigo(jogador.profile_at, agora())) {
                try {
                    const perfil = await pedir(() => leetify.perfil(s));
                    db.guardarPerfil(s, perfil);
                    // Daily history of the ranks, for "how much did they climb this month"
                    db.guardarRank(s, quando, { premier: perfil.ranks?.premier ?? null, faceitElo: perfil.ranks?.faceit_elo ?? null });
                } catch (error) {
                    // The matches came back, so the player is fine; only the profile ratings are missing
                    if (!(error instanceof ErroPerfil)) throw error;
                }
                db.marcarPerfilRecolhido(s, quando);
            }
            return novas;
        } catch (error) {
            if (!(error instanceof ErroPerfil)) throw error;
            db.marcarEstado(s, error.estado);
            db.marcarRecolha(s, agora().toISOString());
            return 0;
        }
    }

    async function correr() {
        const resultado = { novas: 0, jogadores: 0, parado: null };
        if (emPausaAte && agora() < new Date(emPausaAte)) return { ...resultado, parado: 'limite' };

        const pedir = ritmo();
        const statsDaRecolha = new Map();
        for (const jogador of db.jogadoresLigados()) {
            // Missing or private Leetify profiles are only retried once a day (FACEIT still runs)
            const saltarLeetify = jogador.leetify_status !== 'ok' && !antigo(jogador.last_fetched_at, agora());
            if (saltarLeetify && !faceit) continue;
            try {
                resultado.novas += await recolher(jogador, pedir, { saltarLeetify, statsDaRecolha });
                resultado.jogadores++;
            } catch (error) {
                if (error instanceof ErroLimite) {
                    emPausaAte = new Date(agora().getTime() + error.esperarMs).toISOString();
                    console.error(`⚠️ ${error.message}`);
                    return { ...resultado, parado: 'limite' };
                }
                if (error instanceof ErroOrcamento) {
                    orcamentoEsgotado = true;
                    console.error(`⚠️ ${error.message}, skipping collections until midnight`);
                    return { ...resultado, parado: 'orcamento' };
                }
                console.error(`❌ Could not fetch matches of ${jogador.steam64_id}:`, error.message);
            }
        }
        emPausaAte = null;
        orcamentoEsgotado = false;
        ultimaRecolha = agora().toISOString();
        return resultado;
    }

    return {
        recolherTudo() {
            emCurso ??= correr().finally(() => { emCurso = null; });
            return emCurso;
        },
        async recolherJogador(steam64Id) {
            const jogador = db.jogadorPorSteam(steam64Id);
            return jogador ? recolher({ ...jogador, profile_at: null }, ritmo()) : 0;
        },
        estado: () => ({ ultimaRecolha, emPausaAte, orcamentoEsgotado }),
    };
}

module.exports = { criarRecolha };
