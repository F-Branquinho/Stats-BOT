const { test } = require('node:test');
const assert = require('node:assert');
const { escolherVencedores, mensagemRelatorio } = require('../src/report');
const { ordenarPorPontos } = require('../src/leaderboard');

function linha(n, extra = {}) {
    return {
        steam64Id: `s${n}`, partidas: 10, vitorias: 5, empates: 1, derrotas: 4, pontos: 100 - n, hltv: 1.1,
        kills: 100 + n, deaths: 90, kd: 1.1, hs: 0.4, precisao: 0.3, flashes: 50, cegos: 20, teamflashes: 5,
        leetify: 0.01, aim: 70, elegivel: true, ...extra,
    };
}

const mencao = (s) => `<@1234567890123456${s.slice(1).padStart(2, '0')}>`;

test('top 10 out of 12 eligible players, sorted by points', () => {
    const linhas = Array.from({ length: 12 }, (_, i) => linha(i + 1)).sort(ordenarPorPontos);
    const { top } = escolherVencedores(linhas);
    assert.strictEqual(top.length, 10);
    assert.strictEqual(top[0].steam64Id, 's1');
});

test('non-eligible players are not in the top or in awards, except most matches', () => {
    const linhas = [linha(1), linha(2, { elegivel: false, partidas: 4, kills: 999, cegos: 999 }), linha(3, { partidas: 9 })];
    const v = escolherVencedores(linhas);
    assert.deepStrictEqual(v.top.map((l) => l.steam64Id), ['s1', 's3']);
    assert.strictEqual(v.premios.kills.steam64Id, 's3');
    assert.strictEqual(v.premios.flash.steam64Id, 's1');
    assert.deepStrictEqual(escolherVencedores([linha(1, { partidas: 5 }), linha(2, { elegivel: false, partidas: 4 })]).premios.partidas, { steam64Id: 's1', valor: 5 });
    assert.deepStrictEqual(escolherVencedores([linha(2, { elegivel: false, partidas: 4 })]).premios.partidas, { steam64Id: 's2', valor: 4 });
});

test('each award picks the highest value, ties by points', () => {
    const linhas = [linha(1, { precisao: 0.5, hs: 0.3 }), linha(2, { precisao: 0.5, hs: 0.6, teamflashes: 30 })];
    const { premios } = escolherVencedores(linhas);
    assert.deepStrictEqual(premios.aim, { steam64Id: 's1', valor: 0.5 });
    assert.deepStrictEqual(premios.hs, { steam64Id: 's2', valor: 0.6 });
    assert.deepStrictEqual(premios.teamflash, { steam64Id: 's2', valor: 30 });
});

test('Portuguese message: MVP line, top and every award', () => {
    const linhas = [linha(1), linha(2), linha(3)];
    const texto = mensagemRelatorio({ vencedores: escolherVencedores(linhas), mes: '2026-10', idioma: 'pt', mencao });
    assert.match(texto, /outubro de 2026/);
    const linhasTop = texto.split('\n').filter((l) => /^(🏆 )?\d+\. /.test(l));
    assert.strictEqual(linhasTop.length, 3);
    assert.ok(linhasTop[0].startsWith('🏆 1. <@'));
    assert.match(linhasTop[0], /99 pts · 5V 1E 4D · 1\.10/);
    for (const emoji of ['🔫', '🎯', '🧠', '💡', '🤦', '🎮']) assert.ok(texto.includes(emoji), emoji);
    assert.ok(!texto.includes('\n\n\n'));
});

test('English message uses the English month and W/D/L', () => {
    const texto = mensagemRelatorio({ vencedores: escolherVencedores([linha(1)]), mes: '2026-10', idioma: 'en', mencao });
    assert.match(texto, /October 2026/);
    assert.match(texto, /5W 1D 4L/);
});

test('nobody eligible: short "not enough matches" message', () => {
    const v = escolherVencedores([linha(1, { elegivel: false, partidas: 2 })]);
    const texto = mensagemRelatorio({ vencedores: v, mes: '2026-10', idioma: 'pt', mencao });
    assert.match(texto, /5 partidas/);
    assert.ok(!texto.includes('🏆'));
});

test('a full report fits in one Discord message', () => {
    const linhas = Array.from({ length: 10 }, (_, i) => linha(i + 1, { kills: 10000, pontos: 1000 - i }));
    for (const idioma of ['pt', 'en']) {
        const texto = mensagemRelatorio({ vencedores: escolherVencedores(linhas), mes: '2026-10', idioma, mencao });
        assert.ok(texto.length <= 2000, `${idioma}: ${texto.length}`);
    }
});
