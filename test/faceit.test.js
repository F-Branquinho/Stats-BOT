const { test } = require('node:test');
const assert = require('node:assert');
const { criarFaceit, converterPartida } = require('../src/faceit');
const { partidaConta, hltv1 } = require('../src/rating');
const historico = require('./fixtures/faceit-historico.json');
const stats = require('./fixtures/faceit-stats.json');

const PLAYER = '62cbcad9-3f4b-4788-ac14-291659b28a71';
const STEAM = '76561198053742791';

test('converterPartida turns a FACEIT match into the same shape as a Leetify one', () => {
    const { match, stats: s } = converterPartida(historico.items[0], stats, PLAYER, STEAM);
    assert.deepStrictEqual(match, {
        id: '1-d573d1e9-0bc0-4f69-89a2-d2c4f1397e9d',
        data_source_match_id: '1-d573d1e9-0bc0-4f69-89a2-d2c4f1397e9d',
        data_source: 'faceit',
        finished_at: '2026-10-20T20:59:17.000Z',
        map_name: 'de_dust2',
        has_banned_player: false,
    });
    assert.deepStrictEqual(s, {
        steam64_id: STEAM, total_kills: 17, total_deaths: 17, total_assists: 5, total_hs_kills: 11,
        rounds_count: 24, rounds_won: 11, rounds_lost: 13,
        // 17 kills − 2×4 doubles − 3×1 triple = 6 rounds with one kill
        multi1k: 6, multi2k: 4, multi3k: 1, multi4k: 0, multi5k: 0,
        total_damage: 2038, mvps: 3, flashbang_thrown: 11, flashbang_hit_foe: 6, initial_team_number: 1,
    });
    assert.strictEqual(partidaConta(match, s), true);
    assert.strictEqual(typeof hltv1(s), 'number');
});

test('converterPartida returns null when the player is not in the match stats', () => {
    assert.strictEqual(converterPartida(historico.items[0], stats, 'outro', STEAM), null);
    assert.strictEqual(converterPartida(historico.items[0], { rounds: [] }, PLAYER, STEAM), null);
});

function resposta(status, corpo) {
    return { ok: status >= 200 && status < 300, status, json: async () => corpo };
}

function preparar(respostas) {
    const pedidos = [];
    const faceit = criarFaceit({
        chave: 'k',
        fetch: async (url, opcoes) => { pedidos.push({ url, opcoes }); return respostas.shift(); },
    });
    return { faceit, pedidos };
}

test('jogador finds the FACEIT account by Steam ID, with level and ELO', async () => {
    const { faceit, pedidos } = preparar([resposta(200, { player_id: PLAYER, games: { cs2: { skill_level: 10, faceit_elo: 2018 } } })]);
    assert.deepStrictEqual(await faceit.jogador(STEAM), { playerId: PLAYER, nivel: 10, elo: 2018 });
    assert.strictEqual(pedidos[0].url, `https://open.faceit.com/data/v4/players?game=cs2&game_player_id=${STEAM}`);
    assert.strictEqual(pedidos[0].opcoes.headers.Authorization, 'Bearer k');
});

test('jogador: no FACEIT account (404) → null', async () => {
    const { faceit } = preparar([resposta(404, { errors: [] })]);
    assert.strictEqual(await faceit.jogador(STEAM), null);
});

test('historico keeps finished 5v5 matches; stats fetches one match', async () => {
    const item = historico.items[0];
    const { faceit, pedidos } = preparar([
        resposta(200, { items: [item, { ...item, match_id: '1-x', status: 'cancelled' }, { ...item, match_id: '1-y', game_mode: '2v2' }] }),
        resposta(200, stats),
    ]);
    assert.deepStrictEqual((await faceit.historico(PLAYER)).map((m) => m.match_id), [item.match_id]);
    assert.strictEqual(pedidos[0].url, `https://open.faceit.com/data/v4/players/${PLAYER}/history?game=cs2&limit=20`);
    assert.deepStrictEqual(await faceit.stats(item.match_id), stats);
    assert.strictEqual(pedidos[1].url, `https://open.faceit.com/data/v4/matches/${item.match_id}/stats`);
});

test('other FACEIT errors are thrown with the status', async () => {
    const { faceit } = preparar([resposta(503, {})]);
    await assert.rejects(faceit.historico(PLAYER), /503/);
});
