const { test } = require('node:test');
const assert = require('node:assert');
const { abrirBD } = require('../src/db');
const { tabela, ordenarPor, porMes } = require('../src/leaderboard');

const AGORA = new Date('2026-10-25T12:00:00Z');
let contador = 0;

// Stores a counted 20-round match (13–7 win by default) for one player
function partida(db, steam64Id, {
    quando = '2026-10-10T20:00:00.000Z', v = 13, d = 7, kills = 20, deaths = 15, hs = 10, multi = [10, 5, 0, 0, 0],
    id = null, data_source = 'matchmaking', map_name = 'de_mirage', ...extra
} = {}) {
    contador++;
    db.guardarPartida(
        { id: id ?? `m${contador}`, finished_at: quando, map_name, data_source, has_banned_player: false },
        {
            steam64_id: steam64Id, rounds_count: v + d, rounds_won: v, rounds_lost: d,
            total_kills: kills, total_deaths: deaths, total_hs_kills: hs,
            multi1k: multi[0], multi2k: multi[1], multi3k: multi[2], multi4k: multi[3], multi5k: multi[4],
            shots_fired_enemy_spotted: 100, shots_hit_enemy_spotted: 40,
            flashbang_thrown: 10, flashbang_hit_foe: 6, flashbang_hit_friend: 2, leetify_rating: 0.05,
            ...extra,
        },
    );
}

test('totals and averages for this month', () => {
    const db = abrirBD(':memory:');
    db.guardarPerfil('s1', { rating: { aim: 77 } });
    partida(db, 's1', { kills: 20, deaths: 10, hs: 10 });
    partida(db, 's1', { v: 7, d: 13, kills: 10, deaths: 20, hs: 2, shots_hit_enemy_spotted: 20 });
    partida(db, 's1', { quando: '2026-09-30T22:59:00.000Z' }); // September in Lisbon: left out
    const [l] = tabela(db, ['s1'], 'mes', AGORA);
    assert.strictEqual(l.steam64Id, 's1');
    assert.strictEqual(l.partidas, 2);
    assert.strictEqual(l.vitorias, 1);
    assert.strictEqual(l.derrotas, 1);
    assert.strictEqual(l.empates, 0);
    assert.strictEqual(l.kills, 30);
    assert.strictEqual(l.deaths, 30);
    assert.strictEqual(l.kd, 1);
    assert.strictEqual(l.hs, 12 / 30);
    assert.strictEqual(l.precisao, 60 / 200);
    assert.strictEqual(l.flashes, 20);
    assert.strictEqual(l.cegos, 12);
    assert.strictEqual(l.teamflashes, 4);
    assert.strictEqual(l.flashPct, 12 / 20);
    assert.strictEqual(l.tfPct, 4 / 20);
    assert.strictEqual(l.aim, 77);
    assert.strictEqual(l.leetify, 0.05);
    const ps = db.partidasDe(['s1'], '2026-10-01', null);
    assert.strictEqual(l.pontos, ps[0].points + ps[1].points);
    assert.strictEqual(l.hltv, Math.round(((ps[0].hltv_rating + ps[1].hltv_rating) / 2) * 100) / 100);
});

test('elegivel needs 5 matches in a monthly period, always true for sempre', () => {
    const db = abrirBD(':memory:');
    for (let i = 0; i < 4; i++) partida(db, 's1');
    for (let i = 0; i < 5; i++) partida(db, 's2');
    const linhas = tabela(db, ['s1', 's2'], 'mes', AGORA);
    assert.strictEqual(linhas.find((l) => l.steam64Id === 's1').elegivel, false);
    assert.strictEqual(linhas.find((l) => l.steam64Id === 's2').elegivel, true);
    assert.ok(tabela(db, ['s1'], 'sempre', AGORA).every((l) => l.elegivel));
});

test('sorted by points, then wins, then HLTV rating, then matches', () => {
    const db = abrirBD(':memory:');
    // b has the most points; a and c tie on points and wins, a has the higher average rating
    partida(db, 'a', { kills: 30, deaths: 5, multi: [10, 10, 0, 0, 0] });           // V + 5 = 8
    partida(db, 'b', { kills: 30, deaths: 5, multi: [10, 10, 0, 0, 0] });           // 8
    partida(db, 'b', { v: 10, d: 10, kills: 0, deaths: 20, multi: [0, 0, 0, 0, 0] }); // draw, 1 + 0 → b = 9
    partida(db, 'c', { kills: 30, deaths: 5, multi: [10, 10, 0, 0, 0] });           // 8, same as a
    partida(db, 'c', { v: 0, d: 20, kills: 0, deaths: 20, multi: [0, 0, 0, 0, 0] }); // loss, 0 → 8 with 1 win, lower rating
    const ordem = tabela(db, ['a', 'b', 'c'], 'mes', AGORA).map((l) => l.steam64Id);
    assert.deepStrictEqual(ordem, ['b', 'a', 'c']);
});

test('players without matches in the period are left out', () => {
    const db = abrirBD(':memory:');
    partida(db, 's1', { quando: '2026-09-15T20:00:00.000Z' });
    assert.deepStrictEqual(tabela(db, ['s1'], 'mes', AGORA), []);
    assert.strictEqual(tabela(db, ['s1'], 'mes_passado', AGORA).length, 1);
});

test('zero deaths and zero kills do not divide by zero', () => {
    const db = abrirBD(':memory:');
    partida(db, 's1', { kills: 0, deaths: 0, hs: 0, multi: [0, 0, 0, 0, 0], shots_fired_enemy_spotted: 0, shots_hit_enemy_spotted: 0 });
    const [l] = tabela(db, ['s1'], 'mes', AGORA);
    assert.strictEqual(l.kd, 0);
    assert.strictEqual(l.hs, 0);
    assert.strictEqual(l.precisao, 0);
    assert.strictEqual(l.flashPct, 0.6);
});

test('porMes groups a player\'s matches by Lisbon month, newest first', () => {
    const db = abrirBD(':memory:');
    partida(db, 's1', { quando: '2026-10-10T20:00:00.000Z' });
    partida(db, 's1', { quando: '2026-10-31T23:30:00.000Z', v: 7, d: 13 });
    partida(db, 's1', { quando: '2026-09-30T23:30:00.000Z' }); // 1 October 00:30 in Lisbon
    partida(db, 's1', { quando: '2026-09-15T20:00:00.000Z' });
    const meses = porMes(db.partidasDe(['s1'], null, null));
    assert.deepStrictEqual(meses.map((m) => [m.mes, m.partidas, m.vitorias, m.derrotas]), [['2026-10', 3, 2, 1], ['2026-09', 1, 1, 0]]);
    assert.strictEqual(typeof meses[0].pontos, 'number');
    assert.strictEqual(typeof meses[0].hltv, 'number');
});

test('ordenarPor a column, ties by points', () => {
    const linhas = [
        { steam64Id: 'a', kills: 10, pontos: 5, vitorias: 1, hltv: 1, partidas: 1 },
        { steam64Id: 'b', kills: 30, pontos: 1, vitorias: 0, hltv: 1, partidas: 1 },
        { steam64Id: 'c', kills: 10, pontos: 9, vitorias: 2, hltv: 1, partidas: 1 },
    ];
    assert.deepStrictEqual(ordenarPor(linhas, 'kills').map((l) => l.steam64Id), ['b', 'c', 'a']);
    assert.deepStrictEqual(ordenarPor(linhas, 'naoexiste').map((l) => l.steam64Id), ['c', 'a', 'b']);
});

test('flash percentages are 0 without flashes thrown', () => {
    const db = abrirBD(':memory:');
    partida(db, 's1', { flashbang_thrown: 0, flashbang_hit_foe: 0, flashbang_hit_friend: 0 });
    const [l] = tabela(db, ['s1'], 'mes', AGORA);
    assert.strictEqual(l.flashPct, 0);
    assert.strictEqual(l.tfPct, 0);
});

test('HE damage totals, teammates and per HE (matches without HE data left out of the average)', () => {
    const db = abrirBD(':memory:');
    partida(db, 's1', { he_thrown: 10, he_foes_damage_avg: 5, he_friends_damage_avg: 1 });  // 50 / 10
    partida(db, 's1', { he_thrown: 5, he_foes_damage_avg: 20, he_friends_damage_avg: 0 });  // 100 / 0
    partida(db, 's1', { he_thrown: 7 });                                                    // no damage data
    const [l] = tabela(db, ['s1'], 'mes', AGORA);
    assert.strictEqual(l.heDano, 150);
    assert.strictEqual(l.heTeam, 10);
    assert.strictEqual(l.hePorNade, 10);
});

test('the Leetify rating average keeps its precision (shown ×100 on the site)', () => {
    const db = abrirBD(':memory:');
    partida(db, 's1', { leetify_rating: 0.0117 });
    partida(db, 's1', { leetify_rating: 0.0223 });
    const [l] = tabela(db, ['s1'], 'mes', AGORA);
    assert.ok(Math.abs(l.leetify - 0.017) < 1e-9, String(l.leetify));
});

test('v0.7 columns: ADR, utility, multi-kills, trades and aim', () => {
    const db = abrirBD(':memory:');
    db.guardarPerfil('s1', { rating: { aim: 80, clutch: 0.12, opening: -0.01 } });
    partida(db, 's1', {
        v: 13, d: 7, multi: [5, 3, 2, 1, 1], total_damage: 1800, flashbang_thrown: 10, flashbang_hit_foe: 6, flashbang_hit_foe_avg_duration: 3,
        flashbang_leading_to_kill: 2, flash_assist: 1, he_thrown: 4, molotov_thrown: 3, smoke_thrown: 3, utility_on_death_avg: 100,
        mvps: 4, trade_kill_attempts: 4, trade_kills_succeed: 2, traded_death_attempts: 5, traded_deaths_succeed: 1,
        shots_fired: 200, shots_hit_foe: 40, spray_accuracy: 0.3, counter_strafing_shots_good: 30, counter_strafing_shots_all: 40, preaim: 6, reaction_time: 0.4,
    });
    partida(db, 's1', {
        v: 7, d: 13, multi: [4, 1, 0, 0, 0], total_damage: 1200, flashbang_thrown: 10, flashbang_hit_foe: 2, flashbang_hit_foe_avg_duration: 1,
        flashbang_leading_to_kill: 0, flash_assist: 1, he_thrown: 2, molotov_thrown: 1, smoke_thrown: 4, utility_on_death_avg: 200,
        mvps: 1, trade_kill_attempts: 6, trade_kills_succeed: 3, traded_death_attempts: 5, traded_deaths_succeed: 4,
        shots_fired: 100, shots_hit_foe: 20, spray_accuracy: 0.5, counter_strafing_shots_good: 10, counter_strafing_shots_all: 20, preaim: 8, reaction_time: 0.6,
    });
    const [l] = tabela(db, ['s1'], 'mes', AGORA);
    assert.strictEqual(l.adr, 3000 / 40);
    assert.strictEqual(l.duracaoCegueira, (6 * 3 + 2 * 1) / 8);
    assert.strictEqual(l.flashKills, 2);
    assert.strictEqual(l.flashAssists, 2);
    assert.strictEqual(l.heAtiradas, 6);
    assert.strictEqual(l.molotovs, 4);
    assert.strictEqual(l.smokes, 7);
    assert.strictEqual(l.granadasPorRonda, (20 + 6 + 4 + 7) / 40);
    assert.strictEqual(l.utilDesperdicada, 150);
    assert.deepStrictEqual([l.k2, l.k3, l.k4, l.k5], [4, 2, 1, 1]);
    assert.strictEqual(l.mvps, 5);
    assert.strictEqual(l.tradeKills, 5);
    assert.strictEqual(l.tradePct, 5 / 10);
    assert.strictEqual(l.tradedDeaths, 5);
    assert.strictEqual(l.tradedPct, 5 / 10);
    assert.strictEqual(l.precisaoGeral, 60 / 300);
    assert.strictEqual(l.spray, 0.4);
    assert.strictEqual(l.counterStrafing, 40 / 60);
    assert.strictEqual(l.preaim, 7);
    assert.strictEqual(l.reacao, 500);
    assert.strictEqual(l.clutch, 0.12);
    assert.strictEqual(l.opening, -0.01);
});

test('v0.7 columns without data (matches stored before) are null, not 0', () => {
    const db = abrirBD(':memory:');
    partida(db, 's1', {});
    const [l] = tabela(db, ['s1'], 'mes', AGORA);
    for (const c of ['adr', 'duracaoCegueira', 'utilDesperdicada', 'spray', 'preaim', 'reacao', 'precisaoGeral', 'counterStrafing', 'clutch']) {
        assert.strictEqual(l[c], null, c);
    }
});

test('ordenarPor can sort lowest first (reaction time, preaim), empty values still last', () => {
    const linhas = [
        { steam64Id: 'a', reacao: 500, pontos: 1, vitorias: 0, hltv: 1, partidas: 1 },
        { steam64Id: 'b', reacao: null, pontos: 9, vitorias: 0, hltv: 1, partidas: 1 },
        { steam64Id: 'c', reacao: 300, pontos: 5, vitorias: 0, hltv: 1, partidas: 1 },
    ];
    assert.deepStrictEqual(ordenarPor(linhas, 'reacao', { crescente: true }).map((l) => l.steam64Id), ['c', 'a', 'b']);
    assert.deepStrictEqual(ordenarPor(linhas, 'reacao').map((l) => l.steam64Id), ['a', 'c', 'b']);
});

test('ranks: current Premier rating, FACEIT level and ELO, and how much they moved in the period', () => {
    const db = abrirBD(':memory:');
    db.guardarPerfil('s1', { ranks: { premier: 16200, faceit: 8, faceit_elo: 1900 } });
    db.guardarRank('s1', '2026-09-30T20:00:00.000Z', { premier: 15000, faceitElo: 1800 });
    db.guardarRank('s1', '2026-10-20T20:00:00.000Z', { premier: 16200, faceitElo: 1900 });
    partida(db, 's1');
    const [l] = tabela(db, ['s1'], 'mes', AGORA);
    assert.deepStrictEqual([l.premier, l.faceitNivel, l.elo, l.premierDelta, l.eloDelta], [16200, 8, 1900, 1200, 100]);
});

test('ranks without history: no change shown (null)', () => {
    const db = abrirBD(':memory:');
    partida(db, 's1');
    const [l] = tabela(db, ['s1'], 'mes', AGORA);
    assert.deepStrictEqual([l.premier, l.premierDelta, l.eloDelta], [null, null, null]);
});

test('form: last 5 results (newest last), wins among them, current streak and best win streak', () => {
    const db = abrirBD(':memory:');
    // Oldest to newest: V V V D V V E V V
    const resultados = ['V', 'V', 'V', 'D', 'V', 'V', 'E', 'V', 'V'];
    resultados.forEach((r, i) => partida(db, 's1', {
        quando: `2026-10-${String(i + 1).padStart(2, '0')}T20:00:00.000Z`,
        v: r === 'V' ? 13 : r === 'E' ? 12 : 5, d: r === 'V' ? 5 : r === 'E' ? 12 : 13,
    }));
    const [l] = tabela(db, ['s1'], 'mes', AGORA);
    assert.strictEqual(l.formaTexto, 'VVEVV');
    assert.strictEqual(l.forma, 4);
    assert.strictEqual(l.sequenciaAtual, '2V');
    assert.strictEqual(l.melhorSequencia, 3);
});

test('CT and T ratings, assists, survival and shots that hit teammates', () => {
    const db = abrirBD(':memory:');
    partida(db, 's1', { ct_leetify_rating: 0.05, t_leetify_rating: -0.01, total_assists: 4, rounds_survived: 8, shots_hit_friend: 2 });
    partida(db, 's1', { ct_leetify_rating: 0.01, t_leetify_rating: 0.03, total_assists: 6, rounds_survived: 12, shots_hit_friend: 0 });
    const [l] = tabela(db, ['s1'], 'mes', AGORA);
    assert.ok(Math.abs(l.ctLeetify - 0.03) < 1e-9);
    assert.ok(Math.abs(l.tLeetify - 0.01) < 1e-9);
    assert.strictEqual(l.assistencias, 10);
    assert.strictEqual(l.assistPorPartida, 5);
    assert.strictEqual(l.sobrevivencia, 20 / 40);
    assert.strictEqual(l.tirosEquipa, 2);
});

test('tabela can keep only some match types', () => {
    const db = abrirBD(':memory:');
    partida(db, 's1');
    partida(db, 's1', { data_source: 'faceit' });
    assert.strictEqual(tabela(db, ['s1'], 'mes', AGORA)[0].partidas, 2);
    assert.strictEqual(tabela(db, ['s1'], 'mes', AGORA, { fontes: ['faceit'] })[0].partidas, 1);
    assert.deepStrictEqual(tabela(db, ['s1'], 'mes', AGORA, { fontes: ['matchmaking_competitive'] }), []);
});
