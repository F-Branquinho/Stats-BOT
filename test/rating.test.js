const { test } = require('node:test');
const assert = require('node:assert');
const { hltv1, resultado, bonusRating, pontos, partidaConta } = require('../src/rating');
const partidas = require('./fixtures/partidas.json');

const s1mple = {
    total_kills: 25, total_deaths: 19, rounds_count: 35, rounds_won: 19, rounds_lost: 16,
    multi1k: 10, multi2k: 4, multi3k: 1, multi4k: 1, multi5k: 0,
};

test('hltv1 matches the HLTV 1.0 formula', () => {
    // kill 1.0520 + 0.7 × survival 1.0095 + rmk 1.1411 = 3.2026 / 2.7 = 1.1861
    assert.strictEqual(hltv1(s1mple), 1.19);
    // Real Premier match: 26 kills, 15 deaths, 23 rounds, multi 5/3/5/0/0
    assert.strictEqual(hltv1(partidas[0].stats[0]), 1.68);
});

test('bonusRating tiers, lower bound inclusive', () => {
    const casos = [[0.79, 0], [0.80, 1], [0.94, 1], [0.95, 2], [1.04, 2], [1.05, 3], [1.19, 3], [1.20, 4], [1.39, 4], [1.40, 5], [2.5, 5]];
    for (const [rating, bonus] of casos) assert.strictEqual(bonusRating(rating), bonus, `rating ${rating}`);
});

test('resultado: win, draw, loss', () => {
    assert.strictEqual(resultado({ rounds_won: 13, rounds_lost: 10 }), 'V');
    assert.strictEqual(resultado({ rounds_won: 12, rounds_lost: 12 }), 'E');
    assert.strictEqual(resultado({ rounds_won: 8, rounds_lost: 13 }), 'D');
});

test('pontos = result points + rating bonus', () => {
    assert.strictEqual(pontos('V', 1.25), 7);
    assert.strictEqual(pontos('E', 0.5), 1);
    assert.strictEqual(pontos('D', 1.45), 5);
});

test('partida sem rondas: no rating and not counted, without throwing', () => {
    const stats = { ...s1mple, rounds_count: 0 };
    assert.strictEqual(hltv1(stats), null);
    assert.strictEqual(partidaConta({ data_source: 'matchmaking', has_banned_player: false }, stats), false);
    assert.strictEqual(hltv1({}), null);
});

test('partidaConta: Premier, Competitive and FACEIT count', () => {
    for (const m of partidas.filter((p) => p.data_source !== 'matchmaking_wingman')) {
        assert.strictEqual(partidaConta(m, m.stats[0]), true, m.data_source);
    }
});

test('partidaConta: banned player, wingman, pro demos and short matches do not count', () => {
    const base = { data_source: 'matchmaking', has_banned_player: false };
    assert.strictEqual(partidaConta({ ...base, has_banned_player: true }, s1mple), false);
    assert.strictEqual(partidaConta({ ...base, data_source: 'matchmaking_wingman' }, s1mple), false);
    assert.strictEqual(partidaConta({ ...base, data_source: 'hltv' }, s1mple), false);
    assert.strictEqual(partidaConta(base, { ...s1mple, rounds_count: 9 }), false);
});
