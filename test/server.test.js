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
