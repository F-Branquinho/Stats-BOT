const { test } = require('node:test');
const assert = require('node:assert');
const { urlLogin, verificar } = require('../src/web/steam');

const PUBLICO = 'https://stats.example.com';

function resposta(valido) {
    return { ok: true, text: async () => `ns:http://specs.openid.net/auth/2.0\nis_valid:${valido}\n` };
}

function query(extra = {}) {
    return {
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'id_res',
        'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
        'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561198053742791',
        'openid.identity': 'https://steamcommunity.com/openid/id/76561198053742791',
        'openid.return_to': `${PUBLICO}/link/steam/callback?state=abc`,
        'openid.response_nonce': '2026-10-25T12:00:00Zxyz',
        'openid.assoc_handle': '1234567890',
        'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
        'openid.sig': 'c2lnbmF0dXJl',
        state: 'abc',
        ...extra,
    };
}

test('urlLogin points to Steam with our return address', () => {
    const url = new URL(urlLogin(PUBLICO, 'abc'));
    assert.strictEqual(url.origin + url.pathname, 'https://steamcommunity.com/openid/login');
    assert.strictEqual(url.searchParams.get('openid.mode'), 'checkid_setup');
    assert.strictEqual(url.searchParams.get('openid.return_to'), `${PUBLICO}/link/steam/callback?state=abc`);
    assert.strictEqual(url.searchParams.get('openid.realm'), PUBLICO);
});

test('valid answer → Steam64 id, checked with Steam', async () => {
    let enviado;
    const fetch = async (url, opcoes) => {
        enviado = { url, corpo: new URLSearchParams(opcoes.body) };
        return resposta(true);
    };
    assert.strictEqual(await verificar(query(), { fetch, publicUrl: PUBLICO }), '76561198053742791');
    assert.strictEqual(enviado.url, 'https://steamcommunity.com/openid/login');
    assert.strictEqual(enviado.corpo.get('openid.mode'), 'check_authentication');
    assert.strictEqual(enviado.corpo.get('openid.sig'), 'c2lnbmF0dXJl');
    assert.strictEqual(enviado.corpo.get('state'), null);
});

test('is_valid:false → null', async () => {
    assert.strictEqual(await verificar(query(), { fetch: async () => resposta(false), publicUrl: PUBLICO }), null);
});

test('claimed_id from another host → null, without asking Steam', async () => {
    let perguntou = false;
    const fetch = async () => { perguntou = true; return resposta(true); };
    const q = query({ 'openid.claimed_id': 'https://evil.example/openid/id/76561198053742791' });
    assert.strictEqual(await verificar(q, { fetch, publicUrl: PUBLICO }), null);
    assert.strictEqual(perguntou, false);
});

test('return_to on another site → null', async () => {
    const q = query({ 'openid.return_to': 'https://evil.example/link/steam/callback?state=abc' });
    assert.strictEqual(await verificar(q, { fetch: async () => resposta(true), publicUrl: PUBLICO }), null);
});

test('cancelled login (mode cancel) → null', async () => {
    assert.strictEqual(await verificar(query({ 'openid.mode': 'cancel' }), { fetch: async () => resposta(true), publicUrl: PUBLICO }), null);
});
