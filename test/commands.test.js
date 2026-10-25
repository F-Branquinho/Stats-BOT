const { test } = require('node:test');
const assert = require('node:assert');
const { definicoes, linhaStats, linhasTop, CATEGORIAS } = require('../src/commands');

const linha = {
    steam64Id: 's1', partidas: 12, vitorias: 7, empates: 1, derrotas: 4, pontos: 55, hltv: 1.08,
    kills: 210, deaths: 180, kd: 1.17, hs: 0.456, precisao: 0.31, flashes: 60, cegos: 41, teamflashes: 9,
    leetify: 0.02, aim: 72.4, elegivel: true,
};

test('command names', () => {
    assert.deepStrictEqual(definicoes.map((c) => c.name), ['link', 'stats', 'top', 'mvp', 'stats-help']);
});

test('/top choices for category and period', () => {
    const top = definicoes.find((c) => c.name === 'top');
    const escolhas = (nome) => top.options.find((o) => o.name === nome).choices.map((c) => c.value);
    assert.deepStrictEqual(escolhas('category'), ['points', 'kills', 'aim', 'hs', 'flashes', 'teamflash', 'matches']);
    assert.deepStrictEqual(escolhas('period'), ['month', 'last_month', 'all']);
    assert.deepStrictEqual(Object.keys(CATEGORIAS), escolhas('category'));
});

test('linhaStats in Portuguese', () => {
    const texto = linhaStats(linha, 'pt');
    assert.match(texto, /55 pts/);
    assert.match(texto, /7V 1E 4D/);
    assert.match(texto, /HLTV 1\.08/);
    assert.match(texto, /210 kills/);
    assert.match(texto, /K\/D 1\.17/);
    assert.match(texto, /HS 46%/);
    assert.match(texto, /41/);
    assert.match(texto, /9/);
});

test('linhaStats in English uses W/D/L', () => {
    assert.match(linhaStats(linha, 'en'), /7W 1D 4L/);
});

test('linhasTop formats values per category, at most 10 lines', () => {
    const linhas = Array.from({ length: 12 }, (_, i) => ({ ...linha, steam64Id: `s${i}`, hs: 0.5 - i / 100 }));
    const texto = linhasTop(linhas, 'hs', (s) => `<@${s}>`);
    const l = texto.split('\n');
    assert.strictEqual(l.length, 10);
    assert.strictEqual(l[0], '1. <@s0> — 50%');
    assert.strictEqual(linhasTop([linha], 'points', (s) => s), '1. s1 — 55');
});
