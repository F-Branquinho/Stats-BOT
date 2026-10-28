const { ErroLimite, ErroOrcamento, ErroPerfil } = require('./leetify');

const INTERVALO_MS = 2000;
const DIA_MS = 24 * 60 * 60 * 1000;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function antigo(iso, agora) {
    return !iso || agora.getTime() - new Date(iso).getTime() >= DIA_MS;
}

/**
 * Fetches new matches of every linked player from Leetify and stores them.
 * `esperar` and `agora` are injectable for tests.
 */
function criarRecolha({ db, leetify, esperar = dormir, agora = () => new Date() }) {
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

    /** Fetches one player's matches (and their profile once a day). Returns how many were new. */
    async function recolher(jogador, pedir) {
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
        for (const jogador of db.jogadoresLigados()) {
            // Missing or private profiles are only retried once a day
            if (jogador.leetify_status !== 'ok' && !antigo(jogador.last_fetched_at, agora())) continue;
            try {
                resultado.novas += await recolher(jogador, pedir);
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
