const { test } = require('node:test');
const assert = require('node:assert');
const { abrirBD } = require('../src/db');
const { criarRecolha } = require('../src/collector');
const { ErroLimite, ErroOrcamento, ErroPerfil } = require('../src/leetify');
const fixtures = require('./fixtures/partidas.json');

const AGORA = new Date('2026-10-22T18:00:00.000Z');

function partidasDe(steam64Id) {
    return fixtures.map((m) => ({ ...m, stats: [{ ...m.stats[0], steam64_id: steam64Id }] }));
}

function preparar({ jogadores = ['s1', 's2'], partidas = partidasDe, perfil = async () => ({ rating: { aim: 70 } }) } = {}) {
    const db = abrirBD(':memory:');
    jogadores.forEach((s, i) => db.ligarJogador({ discordId: `d${i}`, steam64Id: s, nome: s }));
    const chamadas = [];
    const esperas = [];
    const leetify = {
        partidas: async (s) => { chamadas.push(['partidas', s]); return partidas(s); },
        perfil: async (s) => { chamadas.push(['perfil', s]); return perfil(s); },
    };
    let agora = AGORA;
    const recolha = criarRecolha({ db, leetify, esperar: async (ms) => { esperas.push(ms); }, agora: () => agora });
    return { db, recolha, chamadas, esperas, mudarAgora: (d) => { agora = d; } };
}

test('stores new matches, and a second run inserts nothing', async () => {
    const { db, recolha } = preparar();
    const r1 = await recolha.recolherTudo();
    assert.strictEqual(r1.novas, 8);
    assert.strictEqual(r1.jogadores, 2);
    assert.strictEqual(r1.parado, null);
    const r2 = await recolha.recolherTudo();
    assert.strictEqual(r2.novas, 0);
    assert.strictEqual(db.contarPartidas(), 4);
    assert.strictEqual(db.jogador('d0').last_fetched_at, AGORA.toISOString());
    assert.strictEqual(recolha.estado().ultimaRecolha, AGORA.toISOString());
});

test('waits 2 s between Leetify requests', async () => {
    const { recolha, esperas, chamadas } = preparar();
    await recolha.recolherTudo();
    assert.strictEqual(esperas.length, chamadas.length - 1);
    assert.ok(esperas.every((ms) => ms === 2000));
});

test('profile refreshed only when older than 24 h', async () => {
    const { db, recolha, chamadas, mudarAgora } = preparar({ jogadores: ['s1'] });
    await recolha.recolherTudo();
    assert.strictEqual(db.perfil('s1').aim, 70);
    mudarAgora(new Date(AGORA.getTime() + 60 * 60 * 1000));
    await recolha.recolherTudo();
    assert.strictEqual(chamadas.filter(([t]) => t === 'perfil').length, 1);
    mudarAgora(new Date(AGORA.getTime() + 25 * 60 * 60 * 1000));
    await recolha.recolherTudo();
    assert.strictEqual(chamadas.filter(([t]) => t === 'perfil').length, 2);
});

test('rate limit stops the run and pauses until the wait is over', async () => {
    const { recolha, chamadas, mudarAgora } = preparar({
        partidas: (s) => { if (s === 's1') throw new ErroLimite(30000); return partidasDe(s); },
    });
    const r = await recolha.recolherTudo();
    assert.strictEqual(r.parado, 'limite');
    assert.strictEqual(chamadas.length, 1);
    assert.strictEqual(recolha.estado().emPausaAte, new Date(AGORA.getTime() + 30000).toISOString());

    const durantePausa = await recolha.recolherTudo();
    assert.strictEqual(durantePausa.parado, 'limite');
    assert.strictEqual(chamadas.length, 1);

    mudarAgora(new Date(AGORA.getTime() + 31000));
    await recolha.recolherTudo();
    assert.ok(chamadas.length > 1);
});

test('budget reached stops the run', async () => {
    const { recolha } = preparar({ partidas: () => { throw new ErroOrcamento(); } });
    const r = await recolha.recolherTudo();
    assert.strictEqual(r.parado, 'orcamento');
    assert.strictEqual(recolha.estado().orcamentoEsgotado, true);
});

test('missing profile is marked and the run continues', async () => {
    const { db, recolha } = preparar({
        partidas: (s) => { if (s === 's1') throw new ErroPerfil('not_found'); return partidasDe(s); },
    });
    const r = await recolha.recolherTudo();
    assert.strictEqual(r.parado, null);
    assert.strictEqual(db.jogador('d0').leetify_status, 'not_found');
    assert.strictEqual(db.jogador('d1').leetify_status, 'ok');
    assert.strictEqual(r.novas, 4);
});

test('missing profiles are retried only once a day', async () => {
    let falhar = true;
    const { db, recolha, chamadas, mudarAgora } = preparar({
        jogadores: ['s1'],
        partidas: (s) => { if (falhar) throw new ErroPerfil('not_found'); return partidasDe(s); },
    });
    await recolha.recolherTudo();
    falhar = false;
    mudarAgora(new Date(AGORA.getTime() + 60 * 60 * 1000));
    await recolha.recolherTudo();
    assert.strictEqual(chamadas.filter(([t]) => t === 'partidas').length, 1);
    mudarAgora(new Date(AGORA.getTime() + 25 * 60 * 60 * 1000));
    await recolha.recolherTudo();
    assert.strictEqual(db.jogador('d0').leetify_status, 'ok');
});

test('a network error on one player does not stop the others', async () => {
    const { recolha } = preparar({
        partidas: (s) => { if (s === 's1') throw new Error('fetch failed'); return partidasDe(s); },
    });
    const erro = console.error;
    console.error = () => {};
    try {
        const r = await recolha.recolherTudo();
        assert.strictEqual(r.novas, 4);
        assert.strictEqual(r.parado, null);
    } finally {
        console.error = erro;
    }
});

test('a profile 404 after the matches came back keeps the player ok', async () => {
    const { db, recolha } = preparar({ jogadores: ['s1'], perfil: async () => { throw new ErroPerfil('not_found'); } });
    const r = await recolha.recolherTudo();
    assert.strictEqual(r.novas, 4);
    assert.strictEqual(db.jogador('d0').leetify_status, 'ok');
});

test('only one run at a time', async () => {
    const { recolha } = preparar();
    const [a, b] = await Promise.all([recolha.recolherTudo(), recolha.recolherTudo()]);
    assert.strictEqual(a, b);
});

test('recolherJogador fetches one player right away', async () => {
    const { db, recolha } = preparar({ jogadores: ['s1'] });
    assert.strictEqual(await recolha.recolherJogador('s1'), 4);
    assert.strictEqual(db.perfil('s1').aim, 70);
});

test('recolherJogador marks a missing profile and returns 0', async () => {
    const { db, recolha } = preparar({ jogadores: ['s1'], partidas: () => { throw new ErroPerfil('not_found'); } });
    assert.strictEqual(await recolha.recolherJogador('s1'), 0);
    assert.strictEqual(db.jogador('d0').leetify_status, 'not_found');
});

test('a daily rank snapshot is kept when the profile is fetched', async () => {
    const { db, recolha } = preparar({ jogadores: ['s1'], perfil: async () => ({ rating: { aim: 70 }, ranks: { premier: 22699, faceit_elo: 2100 } }) });
    await recolha.recolherTudo();
    assert.deepStrictEqual(db.ranksEntre(['s1'], null, null).get('s1').fim, { premier: 22699, faceitElo: 2100 });
});

const faceitHistorico = require('./fixtures/faceit-historico.json');
const faceitStats = require('./fixtures/faceit-stats.json');
const FACEIT_ID = '62cbcad9-3f4b-4788-ac14-291659b28a71';
const FACEIT_MATCH = faceitHistorico.items[0].match_id;

function faceitFalso({ conta = { playerId: FACEIT_ID, nivel: 10, elo: 2018 }, falhar = false } = {}) {
    const chamadas = [];
    return {
        chamadas,
        jogador: async (s) => { chamadas.push(['jogador', s]); return conta; },
        historico: async (id) => { chamadas.push(['historico', id]); if (falhar) throw new Error('FACEIT answered 503'); return faceitHistorico.items; },
        stats: async (id) => { chamadas.push(['stats', id]); return faceitStats; },
    };
}

function prepararFaceit({ faceit = faceitFalso(), partidas = () => [] } = {}) {
    const db = abrirBD(':memory:');
    db.ligarJogador({ discordId: 'd0', steam64Id: 's1', nome: 's1' });
    let agora = AGORA;
    const leetify = { partidas: async (s) => partidas(s), perfil: async () => ({ rating: { aim: 70 } }) };
    const recolha = criarRecolha({ db, leetify, faceit, esperar: async () => {}, agora: () => agora });
    return { db, recolha, faceit, mudarAgora: (d) => { agora = d; } };
}

test('FACEIT: matches Leetify lacks are fetched and counted, with the FACEIT level and ELO', async () => {
    const { db, recolha } = prepararFaceit();
    const r = await recolha.recolherTudo();
    assert.strictEqual(r.novas, 1);
    const [p] = db.partidasDe(['s1'], null, null);
    assert.deepStrictEqual([p.match_id, p.data_source, p.kills], [FACEIT_MATCH, 'faceit', 17]);
    assert.strictEqual(db.jogador('d0').faceit_id, FACEIT_ID);
    assert.deepStrictEqual([db.perfil('s1').faceit, db.perfil('s1').faceit_elo], [10, 2018]);
    assert.strictEqual(db.ranksEntre(['s1'], null, null).get('s1').fim.faceitElo, 2018);
});

test('FACEIT: a stored match is not fetched again, and the account is looked up once a day', async () => {
    const { recolha, faceit, mudarAgora } = prepararFaceit();
    await recolha.recolherTudo();
    mudarAgora(new Date(AGORA.getTime() + 60 * 60 * 1000));
    await recolha.recolherTudo();
    assert.strictEqual(faceit.chamadas.filter(([t]) => t === 'stats').length, 1);
    assert.strictEqual(faceit.chamadas.filter(([t]) => t === 'jogador').length, 1);
    assert.strictEqual(faceit.chamadas.filter(([t]) => t === 'historico').length, 2);
});

test('FACEIT: players without a FACEIT account are skipped (looked up again a day later)', async () => {
    const { db, recolha, faceit, mudarAgora } = prepararFaceit({ faceit: faceitFalso({ conta: null }) });
    await recolha.recolherTudo();
    assert.strictEqual(db.jogador('d0').faceit_id, '');
    mudarAgora(new Date(AGORA.getTime() + 60 * 60 * 1000));
    await recolha.recolherTudo();
    assert.strictEqual(faceit.chamadas.filter(([t]) => t === 'jogador').length, 1);
    assert.strictEqual(faceit.chamadas.filter(([t]) => t === 'historico').length, 0);
    mudarAgora(new Date(AGORA.getTime() + 25 * 60 * 60 * 1000));
    await recolha.recolherTudo();
    assert.strictEqual(faceit.chamadas.filter(([t]) => t === 'jogador').length, 2);
});

test('FACEIT still runs when the Leetify profile is missing or private', async () => {
    const { db, recolha } = prepararFaceit({ partidas: () => { throw new ErroPerfil('not_found'); } });
    await recolha.recolherTudo();
    assert.strictEqual(db.partidasDe(['s1'], null, null).length, 1);
    assert.strictEqual(db.jogador('d0').leetify_status, 'not_found');
});

test('a FACEIT error does not stop the run', async () => {
    const { recolha } = prepararFaceit({ faceit: faceitFalso({ falhar: true }) });
    const erro = console.error;
    console.error = () => {};
    try {
        const r = await recolha.recolherTudo();
        assert.strictEqual(r.parado, null);
    } finally {
        console.error = erro;
    }
});

test('without a FACEIT client nothing is asked to FACEIT', async () => {
    const db = abrirBD(':memory:');
    db.ligarJogador({ discordId: 'd0', steam64Id: 's1', nome: 's1' });
    const recolha = criarRecolha({ db, leetify: { partidas: async () => [], perfil: async () => ({}) }, esperar: async () => {}, agora: () => AGORA });
    assert.strictEqual((await recolha.recolherTudo()).novas, 0);
});
