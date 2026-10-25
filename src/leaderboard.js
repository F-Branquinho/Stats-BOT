const { intervalo, agoraLisboa } = require('./periodos');

const MIN_PARTIDAS_MVP = 5;

const dividir = (a, b) => (b ? a / b : 0);
const arredondar = (n) => Math.round(n * 100) / 100;

/** Points desc, then wins, average HLTV rating and matches. */
function ordenarPorPontos(a, b) {
    return b.pontos - a.pontos || b.vitorias - a.vitorias || b.hltv - a.hltv || b.partidas - a.partidas;
}

/**
 * Sorts by any numeric column, highest first (or lowest first with `crescente`, for times and angles).
 * Empty values go last; ties, and unknown columns, by points.
 */
function ordenarPor(linhas, coluna, { crescente = false } = {}) {
    const sinal = crescente ? -1 : 1;
    const valor = (l) => (typeof l[coluna] === 'number' ? sinal * l[coluna] : -Infinity);
    return [...linhas].sort((a, b) => (valor(a) !== valor(b) ? valor(b) - valor(a) : ordenarPorPontos(a, b)));
}

const temValor = (v) => v !== null && v !== undefined;

/**
 * Columns from v3 on: matches stored before don't have them, so each one is computed only over
 * the matches that do, and is null when none do (shown as "—", not 0).
 */
function colunasV3(partidas) {
    const com = (campo) => partidas.filter((p) => temValor(p[campo]));
    const somaDe = (lista, campo) => lista.reduce((t, p) => t + p[campo], 0);
    const razao = (campo, divisor) => {
        const lista = com(campo).filter((p) => temValor(p[divisor]));
        const total = somaDe(lista, divisor);
        return lista.length && total ? somaDe(lista, campo) / total : null;
    };
    const media = (campo, escala = 1) => {
        const lista = com(campo);
        return lista.length ? (somaDe(lista, campo) / lista.length) * escala : null;
    };
    const comDano = com('total_damage');
    const comDuracao = com('flash_duration');
    const cegosComDuracao = somaDe(comDuracao, 'flash_hit_foe');
    return {
        adr: comDano.length ? somaDe(comDano, 'total_damage') / somaDe(comDano, 'rounds') : null,
        // Average blind time per enemy flashed (Leetify gives it per match)
        duracaoCegueira: cegosComDuracao ? comDuracao.reduce((t, p) => t + p.flash_duration * p.flash_hit_foe, 0) / cegosComDuracao : null,
        flashAssists: somaDe(com('flash_assist'), 'flash_assist'),
        utilDesperdicada: media('utility_on_death'),
        mvps: somaDe(com('mvps'), 'mvps'),
        tradeKills: somaDe(com('trade_kills_succeed'), 'trade_kills_succeed'),
        tradePct: razao('trade_kills_succeed', 'trade_kill_attempts'),
        tradedDeaths: somaDe(com('traded_deaths_succeed'), 'traded_deaths_succeed'),
        tradedPct: razao('traded_deaths_succeed', 'traded_death_attempts'),
        precisaoGeral: razao('shots_hit_foe', 'shots_fired'),
        spray: media('spray_accuracy'),
        counterStrafing: razao('counter_strafing_good', 'counter_strafing_all'),
        preaim: media('preaim'),
        // Leetify gives seconds; shown in milliseconds
        reacao: media('reaction_time', 1000),
    };
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
        // Not rounded: ratings are small (e.g. 0.0117) and the site shows them ×100
        leetify: comLeetify.length ? comLeetify.reduce((t, p) => t + p.leetify_rating, 0) / comLeetify.length : null,
        flashKills: soma('flash_leading_to_kill'),
        heAtiradas: soma('he_thrown'),
        molotovs: soma('molotov_thrown'),
        smokes: soma('smoke_thrown'),
        granadasPorRonda: dividir(soma('flash_thrown') + soma('he_thrown') + soma('molotov_thrown') + soma('smoke_thrown'), soma('rounds')),
        k2: soma('multi2k'),
        k3: soma('multi3k'),
        k4: soma('multi4k'),
        k5: soma('multi5k'),
        ...colunasV3(partidas),
        aim: perfil?.aim ?? null,
        // Current Leetify ratings (not per period, like aim)
        clutch: perfil?.clutch ?? null,
        opening: perfil?.opening ?? null,
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
