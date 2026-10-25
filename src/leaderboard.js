const { intervalo, agoraLisboa } = require('./periodos');

const MIN_PARTIDAS_MVP = 5;

const dividir = (a, b) => (b ? a / b : 0);
const arredondar = (n) => Math.round(n * 100) / 100;

/** Points desc, then wins, average HLTV rating and matches. */
function ordenarPorPontos(a, b) {
    return b.pontos - a.pontos || b.vitorias - a.vitorias || b.hltv - a.hltv || b.partidas - a.partidas;
}

/** Sorts by any numeric column (desc, empty values last); ties, and unknown columns, by points. */
function ordenarPor(linhas, coluna) {
    const valor = (l) => (typeof l[coluna] === 'number' ? l[coluna] : -Infinity);
    return [...linhas].sort((a, b) => (valor(a) !== valor(b) ? valor(b) - valor(a) : ordenarPorPontos(a, b)));
}

function resumir(steam64Id, partidas, perfil, mensal) {
    const soma = (campo) => partidas.reduce((t, p) => t + (p[campo] ?? 0), 0);
    const comLeetify = partidas.filter((p) => p.leetify_rating !== null);
    const comHE = partidas.filter((p) => p.he_foes_damage !== null && p.he_foes_damage !== undefined);
    const kills = soma('kills');
    const deaths = soma('deaths');
    return {
        steam64Id,
        partidas: partidas.length,
        vitorias: partidas.filter((p) => p.result === 'V').length,
        empates: partidas.filter((p) => p.result === 'E').length,
        derrotas: partidas.filter((p) => p.result === 'D').length,
        pontos: soma('points'),
        hltv: arredondar(dividir(soma('hltv_rating'), partidas.length)),
        kills,
        deaths,
        kd: arredondar(deaths ? kills / deaths : kills),
        hs: dividir(soma('hs_kills'), kills),
        precisao: dividir(soma('shots_hit_enemy_spotted'), soma('shots_fired_enemy_spotted')),
        flashes: soma('flash_thrown'),
        cegos: soma('flash_hit_foe'),
        teamflashes: soma('flash_hit_friend'),
        // Per flash thrown, so it can go over 100% (one flash can blind two people)
        flashPct: dividir(soma('flash_hit_foe'), soma('flash_thrown')),
        tfPct: dividir(soma('flash_hit_friend'), soma('flash_thrown')),
        heDano: soma('he_foes_damage'),
        heTeam: soma('he_friends_damage'),
        // Only matches with HE damage data (older ones may not have it)
        hePorNade: dividir(soma('he_foes_damage'), comHE.reduce((t, p) => t + (p.he_thrown ?? 0), 0)),
        leetify: comLeetify.length ? arredondar(comLeetify.reduce((t, p) => t + p.leetify_rating, 0) / comLeetify.length) : null,
        aim: perfil?.aim ?? null,
        elegivel: !mensal || partidas.length >= MIN_PARTIDAS_MVP,
    };
}

/** One row per player with counted matches in the period, sorted by points. */
function tabela(db, steam64Ids, periodo, agora = new Date()) {
    const { desde, ate, mes } = intervalo(periodo, agora);
    return tabelaEntre(db, steam64Ids, desde, ate, mes !== null);
}

function tabelaEntre(db, steam64Ids, desde, ate, mensal = true) {
    const porJogador = new Map(steam64Ids.map((s) => [s, []]));
    for (const p of db.partidasDe(steam64Ids, desde, ate)) porJogador.get(p.steam64_id).push(p);
    return [...porJogador]
        .filter(([, partidas]) => partidas.length > 0)
        .map(([s, partidas]) => resumir(s, partidas, db.perfil(s), mensal))
        .sort(ordenarPorPontos);
}

/** One player's matches grouped by Lisbon month, newest first (for the profile page). */
function porMes(partidas) {
    const meses = new Map();
    for (const p of partidas) {
        const mes = agoraLisboa(new Date(p.finished_at)).mes;
        if (!meses.has(mes)) meses.set(mes, []);
        meses.get(mes).push(p);
    }
    return [...meses]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([mes, ps]) => {
            const { partidas: n, vitorias, empates, derrotas, pontos, hltv } = resumir(null, ps, null, true);
            return { mes, partidas: n, vitorias, empates, derrotas, pontos, hltv };
        });
}

module.exports = { MIN_PARTIDAS_MVP, tabela, tabelaEntre, ordenarPor, ordenarPorPontos, porMes };
