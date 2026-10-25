const { test } = require('node:test');
const assert = require('node:assert');
const { abrirBD } = require('../src/db');
const { tabela, ordenarPor } = require('../src/leaderboard');

const AGORA = new Date('2026-10-25T12:00:00Z');
let contador = 0;

// Stores a counted 20-round match (13–7 win by default) for one player
function partida(db, steam64Id, { quando = '2026-10-10T20:00:00.000Z', v = 13, d = 7, kills = 20, deaths = 15, hs = 10, multi = [10, 5, 0, 0, 0], ...extra } = {}) {
    contador++;
    db.guardarPartida(
        { id: `m${contador}`, finished_at: quando, map_name: 'de_mirage', data_source: 'matchmaking', has_banned_player: false },
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
