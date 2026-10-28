const { test } = require('node:test');
const assert = require('node:assert');
const { duos, mapas, mapasJogador, recordes } = require('../src/analises');

// A stored match row, as db.partidasDe returns it
function linha(steam64Id, matchId, { team = 2, result = 'V', hltv = 1, mapa = 'de_mirage', kills = 20, dano = 2000, quando = '2026-10-10T20:00:00.000Z' } = {}) {
    return { steam64_id: steam64Id, match_id: matchId, team, result, hltv_rating: hltv, map_name: mapa, kills, total_damage: dano, finished_at: quando };
}

test('duos: friends on the same team in the same match, with W/D/L and average HLTV', () => {
    const partidas = [
        linha('a', 'm1', { hltv: 1.2 }), linha('b', 'm1', { hltv: 1.0 }),
        linha('a', 'm2', { result: 'D', hltv: 0.8 }), linha('b', 'm2', { result: 'D', hltv: 1.0 }),
        linha('a', 'm3'), linha('b', 'm3'),
        // Same match, opposite teams: not a duo
        linha('a', 'm4', { team: 2 }), linha('c', 'm4', { team: 3, result: 'D' }),
        linha('a', 'm5'), linha('c', 'm5'),
    ];
    const [ab, ...resto] = duos(partidas);
    assert.deepStrictEqual(ab, { a: 'a', b: 'b', partidas: 3, vitorias: 2, empates: 0, derrotas: 1, pctVitorias: 2 / 3, hltv: 1 });
    // a+c played together only once: below the 2-match minimum
    assert.deepStrictEqual(resto, []);
});

test('duos: matches without team data are left out, sorted by win %', () => {
    const partidas = [
        linha('a', 'm1', { team: null }), linha('b', 'm1', { team: null }),
        linha('a', 'm2'), linha('b', 'm2'), linha('a', 'm3', { result: 'D' }), linha('b', 'm3', { result: 'D' }),
        linha('c', 'm4'), linha('d', 'm4'), linha('c', 'm5'), linha('d', 'm5'),
    ];
    assert.deepStrictEqual(duos(partidas).map((d) => [d.a, d.b, d.partidas]), [['c', 'd', 2], ['a', 'b', 2]]);
});

test('mapas: matches, win %, average HLTV and the best player (3+ matches) per map', () => {
    const partidas = [
        linha('a', 'm1', { hltv: 1.4 }), linha('b', 'm1', { hltv: 0.9 }),
        linha('a', 'm2', { hltv: 1.2 }), linha('a', 'm3', { hltv: 1.0, result: 'D' }),
        linha('b', 'm4', { hltv: 2.0 }),
        linha('a', 'm5', { mapa: 'de_dust2' }),
    ];
    const [mirage, dust2] = mapas(partidas);
    assert.strictEqual(mirage.mapa, 'de_mirage');
    assert.strictEqual(mirage.partidas, 4);
    assert.strictEqual(mirage.pctVitorias, 4 / 5);
    assert.ok(Math.abs(mirage.hltv - 1.3) < 1e-9);
    assert.deepStrictEqual(mirage.melhor, { steam64Id: 'a', hltv: 1.2, partidas: 3 });
    assert.strictEqual(dust2.melhor, null);
});

test('mapasJogador: per map W/D/L and HLTV, with the best and worst map (3+ matches)', () => {
    const partidas = [
        ...['m1', 'm2', 'm3'].map((id) => linha('a', id, { mapa: 'de_mirage' })),
        ...['m4', 'm5', 'm6'].map((id, i) => linha('a', id, { mapa: 'de_dust2', result: i ? 'D' : 'V', hltv: 0.8 })),
        linha('a', 'm7', { mapa: 'de_nuke', result: 'D' }),
    ];
    const { mapas: lista, melhor, pior } = mapasJogador(partidas);
    assert.deepStrictEqual(lista.map((m) => [m.mapa, m.partidas, m.vitorias, m.derrotas]), [['de_mirage', 3, 3, 0], ['de_dust2', 3, 1, 2], ['de_nuke', 1, 0, 1]]);
    assert.strictEqual(melhor, 'de_mirage');
    assert.strictEqual(pior, 'de_dust2');
});

test('recordes: best HLTV, most kills and most damage in a single match', () => {
    const partidas = [
        linha('a', 'm1', { hltv: 1.9, kills: 30, dano: 3100 }),
        linha('b', 'm2', { hltv: 1.4, kills: 35, dano: 2800, mapa: 'de_nuke' }),
        linha('c', 'm3', { hltv: 1.1, kills: 20, dano: null }),
    ];
    const r = recordes(partidas);
    assert.deepStrictEqual([r.hltv.steam64Id, r.hltv.valor, r.hltv.mapa], ['a', 1.9, 'de_mirage']);
    assert.deepStrictEqual([r.kills.steam64Id, r.kills.valor, r.kills.mapa], ['b', 35, 'de_nuke']);
    assert.deepStrictEqual([r.dano.steam64Id, r.dano.valor], ['a', 3100]);
    assert.deepStrictEqual(recordes([]), { hltv: null, kills: null, dano: null });
});
