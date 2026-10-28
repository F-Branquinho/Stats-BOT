const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-bot-'));
delete process.env.LEETIFY_API_KEY;
delete process.env.LEETIFY_DAILY_BUDGET;
const settings = require('../src/settings');

test('defaults: no Leetify key and a budget of 3000 requests', () => {
    assert.strictEqual(settings.obter().leetifyKey, null);
    assert.strictEqual(settings.obter().orcamentoDiario, 3000);
});

test('values saved from the panel are read back', () => {
    settings.guardar({ leetifyKey: 'k', orcamentoDiario: 500 });
    assert.strictEqual(settings.obter().leetifyKey, 'k');
    assert.strictEqual(settings.obter().orcamentoDiario, 500);
    assert.strictEqual(settings.origem('leetifyKey'), 'panel');
});

test('.env wins over the panel', () => {
    process.env.LEETIFY_API_KEY = 'env';
    try {
        assert.strictEqual(settings.obter().leetifyKey, 'env');
        assert.strictEqual(settings.origem('leetifyKey'), 'env');
    } finally {
        delete process.env.LEETIFY_API_KEY;
    }
});

test('an invalid budget falls back to 3000', () => {
    process.env.LEETIFY_DAILY_BUDGET = 'abc';
    try {
        assert.strictEqual(settings.obter().orcamentoDiario, 3000);
    } finally {
        delete process.env.LEETIFY_DAILY_BUDGET;
    }
});

test('FACEIT key: none by default, from the panel or from .env', () => {
    assert.strictEqual(settings.obter().faceitKey, null);
    settings.guardar({ faceitKey: 'fk' });
    assert.strictEqual(settings.obter().faceitKey, 'fk');
    process.env.FACEIT_API_KEY = 'env-fk';
    try {
        assert.strictEqual(settings.obter().faceitKey, 'env-fk');
        assert.strictEqual(settings.origem('faceitKey'), 'env');
    } finally {
        delete process.env.FACEIT_API_KEY;
    }
});
