const { test } = require('node:test');
const assert = require('node:assert');
const { abrirBD } = require('../src/db');
const { criarLeetify, ErroLimite, ErroOrcamento, ErroPerfil } = require('../src/leetify');

function resposta(status, corpo, headers = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (nome) => headers[nome.toLowerCase()] ?? null },
        json: async () => corpo,
        text: async () => (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
    };
}

function preparar({ respostas, chave = null, orcamento = 3000 }) {
    const db = abrirBD(':memory:');
    const pedidos = [];
    const fetch = async (url, opcoes) => {
        pedidos.push({ url, opcoes });
        return respostas.shift();
    };
    const leetify = criarLeetify({ fetch, chave, orcamento, db, hoje: () => '2026-10-22' });
    return { db, pedidos, leetify };
}

test('partidas calls the matches endpoint and keeps only this player in stats', async () => {
    const corpo = [{ id: 'm1', stats: [{ steam64_id: 's1' }, { steam64_id: 'outro' }] }];
    const { pedidos, leetify } = preparar({ respostas: [resposta(200, corpo)] });
    const partidas = await leetify.partidas('s1');
    assert.strictEqual(pedidos[0].url, 'https://api-public.cs-prod.leetify.com/v3/profile/matches?steam64_id=s1');
    assert.deepStrictEqual(partidas[0].stats, [{ steam64_id: 's1' }]);
});

test('perfil calls the profile endpoint', async () => {
    const { pedidos, leetify } = preparar({ respostas: [resposta(200, { name: 'Ana' })] });
    assert.deepStrictEqual(await leetify.perfil('s1'), { name: 'Ana' });
    assert.strictEqual(pedidos[0].url, 'https://api-public.cs-prod.leetify.com/v3/profile?steam64_id=s1');
});

test('sends _leetify_key only when there is a key', async () => {
    const sem = preparar({ respostas: [resposta(200, {})] });
    await sem.leetify.perfil('s1');
    assert.strictEqual(sem.pedidos[0].opcoes.headers._leetify_key, undefined);

    const com = preparar({ respostas: [resposta(200, {})], chave: 'abc' });
    await com.leetify.perfil('s1');
    assert.strictEqual(com.pedidos[0].opcoes.headers._leetify_key, 'abc');
});

test('429 with Retry-After → ErroLimite with that wait', async () => {
    const { leetify } = preparar({ respostas: [resposta(429, 'Too Many Requests', { 'retry-after': '30' })] });
    await assert.rejects(leetify.perfil('s1'), (e) => e instanceof ErroLimite && e.esperarMs === 30000);
});

test('429 without Retry-After → waits 10 minutes', async () => {
    const { leetify } = preparar({ respostas: [resposta(429, 'Too Many Requests')] });
    await assert.rejects(leetify.perfil('s1'), (e) => e instanceof ErroLimite && e.esperarMs === 600000);
});

test('404 → ErroPerfil not_found (no account or private profile)', async () => {
    const { leetify } = preparar({ respostas: [resposta(404, 'Not Found')] });
    await assert.rejects(leetify.partidas('s1'), (e) => e instanceof ErroPerfil && e.estado === 'not_found');
});

test('other errors are plain errors with the status', async () => {
    const { leetify } = preparar({ respostas: [resposta(502, 'Bad Gateway')] });
    await assert.rejects(leetify.partidas('s1'), (e) => !(e instanceof ErroPerfil) && /502/.test(e.message));
});

test('each request is counted for the day', async () => {
    const { db, leetify } = preparar({ respostas: [resposta(200, {}), resposta(404, 'Not Found')] });
    await leetify.perfil('s1');
    await leetify.perfil('s2').catch(() => {});
    assert.strictEqual(db.pedidosHoje('2026-10-22'), 2);
});

test('budget reached → ErroOrcamento without calling the API', async () => {
    const { db, pedidos, leetify } = preparar({ respostas: [], orcamento: 2 });
    db.contarPedido('2026-10-22');
    db.contarPedido('2026-10-22');
    await assert.rejects(leetify.perfil('s1'), (e) => e instanceof ErroOrcamento);
    assert.strictEqual(pedidos.length, 0);
});

test('requests have a timeout signal', async () => {
    const { pedidos, leetify } = preparar({ respostas: [resposta(200, {})] });
    await leetify.perfil('s1');
    assert.ok(pedidos[0].opcoes.signal);
});
