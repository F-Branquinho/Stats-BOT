const { test } = require('node:test');
const assert = require('node:assert');
const { caminhoLocal } = require('../src/web/server');

test('caminhoLocal keeps local paths', () => {
    assert.strictEqual(caminhoLocal('/link'), '/link');
    assert.strictEqual(caminhoLocal('/s/123?periodo=mes'), '/s/123?periodo=mes');
});

test('caminhoLocal refuses other sites', () => {
    for (const mau of ['//evil.example', '/\\evil.example', 'https://evil.example', 'link', '', undefined, ['/link']]) {
        assert.strictEqual(caminhoLocal(mau), null, String(mau));
    }
});

test('lerCookies ignores a malformed cookie instead of throwing', () => {
    const { lerCookies } = require('../src/web/server');
    const cookies = lerCookies({ headers: { cookie: 'outro=%E0%A4%A; sessao=abc' } });
    assert.strictEqual(cookies.sessao, 'abc');
    assert.strictEqual(cookies.outro, undefined);
});

test('cabecalhosSeguranca adds HSTS when the site is on HTTPS', () => {
    const { cabecalhosSeguranca } = require('../src/web/server');
    assert.match(cabecalhosSeguranca('https://stats.example.com')['Strict-Transport-Security'], /max-age=\d+/);
    assert.strictEqual(cabecalhosSeguranca('http://192.168.1.10:3000')['Strict-Transport-Security'], undefined);
    assert.match(cabecalhosSeguranca(null)['Content-Security-Policy'], /default-src 'none'/);
});
