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
