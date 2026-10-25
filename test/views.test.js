const { test } = require('node:test');
const assert = require('node:assert');
const { paginaTabela, paginaPerfil } = require('../src/web/views-tabela');

const sessao = { userId: 'u1', nome: 'Ana', avatar: null, csrf: 'x', dono: false };
const guild = { id: 'g1', name: 'Os Bons', icon: null };

function linha(extra = {}) {
    return {
        steam64Id: 's1', discordId: 'd1', nome: 'Ana', avatar: null,
        partidas: 6, vitorias: 3, empates: 1, derrotas: 2, pontos: 30, hltv: 1.05, kills: 120, deaths: 100, kd: 1.2,
        hs: 0.45, precisao: 0.3, flashes: 40, cegos: 20, teamflashes: 4, leetify: 0.01, aim: 70.2, elegivel: true, ...extra,
    };
}

test('player names are escaped', () => {
    const html = paginaTabela({ sessao, guild, linhas: [linha({ nome: '<script>alert(1)</script>' })], periodo: 'mes', ordem: 'pontos' });
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('players under 5 matches are marked as not eligible in monthly periods', () => {
    const html = paginaTabela({ sessao, guild, linhas: [linha({ elegivel: false, partidas: 3 })], periodo: 'mes', ordem: 'pontos' });
    assert.match(html, /class="inelegivel"/);
    assert.match(html, /not eligible for MVP/);
});

test('column headers link to sorting, keeping the period', () => {
    const html = paginaTabela({ sessao, guild, linhas: [linha()], periodo: 'mes_passado', ordem: 'kills' });
    assert.match(html, /href="\/s\/g1\?periodo=mes_passado&amp;ordem=kills" class="ativo"/);
    assert.match(html, /href="\/s\/g1\?periodo=mes_passado&amp;ordem=hltv"/);
    assert.match(html, /href="\/s\/g1\?periodo=sempre&amp;ordem=kills"/);
});

test('rows link to the player profile and show the values', () => {
    const html = paginaTabela({ sessao, guild, linhas: [linha()], periodo: 'mes', ordem: 'pontos' });
    assert.match(html, /href="\/s\/g1\/p\/d1"/);
    assert.match(html, /3–1–2/);
    assert.match(html, /45%/);
    assert.match(html, /1\.05/);
});

test('empty table explains how to appear', () => {
    const html = paginaTabela({ sessao, guild, linhas: [], periodo: 'mes', ordem: 'pontos' });
    assert.match(html, /No counted matches/);
    assert.match(html, /href="\/link"/);
});

test('profile lists months and recent matches', () => {
    const html = paginaPerfil({
        sessao,
        guild,
        jogador: { nome: 'Ana', avatar: null, discordId: 'd1', steam64Id: 's1' },
        total: linha(),
        meses: [{ mes: '2026-10', partidas: 6, vitorias: 3, empates: 1, derrotas: 2, pontos: 30, hltv: 1.05 }],
        partidas: [{ finished_at: '2026-10-20T21:00:00.000Z', map_name: 'de_mirage', result: 'V', rounds_won: 13, rounds_lost: 9, kills: 25, deaths: 15, hltv_rating: 1.31, points: 7, data_source: 'faceit' }],
    });
    assert.match(html, /October 2026/);
    assert.match(html, /Mirage/);
    assert.match(html, /13–9/);
    assert.match(html, /1\.31/);
    assert.match(html, /FACEIT/);
    assert.match(html, /class="res-V"/);
});

test('award leaders get their emojis with a tooltip', () => {
    const premios = new Map([['s1', [{ premio: 'mvp', emoji: '🏆', valor: 30 }, { premio: 'kills', emoji: '🔫', valor: 120 }, { premio: 'hs', emoji: '🧠', valor: 0.45 }]]]);
    const html = paginaTabela({ sessao, guild, linhas: [linha()], periodo: 'mes', ordem: 'pontos', premios });
    assert.match(html, /<span class="premio" title="Leading the MVP race \(30 points\)">🏆<\/span>/);
    assert.match(html, /title="Leading: most kills \(120\)">🔫/);
    assert.match(html, /title="Leading: best HS% \(45%\)">🧠/);
    assert.match(html, /class="legenda"/);
});

test('last month shows the winners, not the leaders', () => {
    const premios = new Map([['s1', [{ premio: 'kills', emoji: '🔫', valor: 120 }]]]);
    const html = paginaTabela({ sessao, guild, linhas: [linha()], periodo: 'mes_passado', ordem: 'pontos', premios });
    assert.match(html, /title="Won: most kills \(120\)">🔫/);
});

test('all time has no award emojis', () => {
    const html = paginaTabela({ sessao, guild, linhas: [linha()], periodo: 'sempre', ordem: 'pontos', premios: new Map() });
    assert.ok(!html.includes('class="premio"'));
    assert.ok(!html.includes('class="legenda"'));
});

test('the table has Flash % and TF % columns', () => {
    const html = paginaTabela({ sessao, guild, linhas: [linha({ flashPct: 0.75, tfPct: 1.5 })], periodo: 'mes', ordem: 'flashPct' });
    assert.match(html, /ordem=flashPct" class="ativo">Flash %/);
    assert.match(html, /ordem=tfPct">TF %/);
    assert.match(html, /<td>75%<\/td>/);
    assert.match(html, /<td>150%<\/td>/);
});
