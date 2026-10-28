const { test } = require('node:test');
const assert = require('node:assert');
const { paginaTabela, paginaPerfil } = require('../src/web/views-tabela');

const sessao = { userId: 'u1', nome: 'Ana', avatar: null, csrf: 'x', dono: false };
const guild = { id: 'g1', name: 'Os Bons', icon: null };

function linha(extra = {}) {
    return {
        adr: 81.4, heAtiradas: 20, heDano: 150.4, hePorNade: 10.04, heTeam: 9.6, flashPct: 0.75, tfPct: 1.5,
        duracaoCegueira: 3.24, flashKills: 6, flashAssists: 4, molotovs: 12, smokes: 20, granadasPorRonda: 0.5, utilDesperdicada: 161.1,
        k2: 8, k3: 3, k4: 1, k5: 1, mvps: 12, tradeKills: 5, tradePct: 0.4, tradedDeaths: 6, tradedPct: 0.5, clutch: 0.1221, opening: -0.0021,
        precisaoGeral: 0.17, spray: 0.35, counterStrafing: 0.81, preaim: 6.26, reacao: 375,
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


const pagina = (extra = {}) => paginaTabela({ sessao, guild, linhas: [linha()], periodo: 'mes', ordem: 'pontos', ordens: {}, ...extra });

test('main table: core columns plus ADR, no utility columns', () => {
    const html = pagina();
    const principal = html.slice(0, html.indexOf('id="utilitarios"'));
    assert.match(principal, />ADR</);
    assert.match(principal, /<td>81<\/td>/);
    assert.ok(!principal.includes('Flash %'));
    assert.ok(!principal.includes('HE dmg'));
});

test('there are utility, multi-kill and aim tables below', () => {
    const html = pagina();
    for (const id of ['utilitarios', 'multikills', 'mira']) assert.match(html, new RegExp(`id="${id}"`));
    assert.match(html, />Flash %</);
    assert.match(html, />HE dmg</);
    assert.match(html, />Molotovs</);
    assert.match(html, />ACE</);
    assert.match(html, />Trade %</);
    assert.match(html, />Reaction</);
});

test('each table sorts on its own and keeps the other sorts and the period', () => {
    const html = pagina({ periodo: 'mes_passado', ordem: 'kills', ordens: { u: 'heDano', k: 'k5', m: 'reacao' } });
    assert.match(html, /href="\/s\/g1\?periodo=mes_passado&amp;tipo=todas&amp;ordem=kills&amp;r=premier&amp;u=heDano&amp;k=k5&amp;l=ctLeetify&amp;m=reacao" class="ativo">Kills/);
    assert.match(html, /href="\/s\/g1\?periodo=mes_passado&amp;tipo=todas&amp;ordem=kills&amp;r=premier&amp;u=heDano&amp;k=k5&amp;l=ctLeetify&amp;m=reacao#utilitarios" class="ativo">HE dmg/);
    assert.match(html, /href="\/s\/g1\?periodo=mes_passado&amp;tipo=todas&amp;ordem=kills&amp;r=premier&amp;u=flashPct&amp;k=k5&amp;l=ctLeetify&amp;m=reacao#utilitarios">Flash %/);
    assert.match(html, /href="\/s\/g1\?periodo=sempre&amp;tipo=todas&amp;ordem=kills&amp;r=premier&amp;u=heDano&amp;k=k5&amp;l=ctLeetify&amp;m=reacao"/);
});

test('utility, multi-kill and aim values are formatted', () => {
    const html = pagina();
    for (const valor of ['75%', '150%', '150', '10.0', '3.2s', '0.50', '$161', '40%', '17%', '81%', '6.3°', '375 ms', '+12.21']) {
        assert.ok(html.includes(`<td>${valor}</td>`), valor);
    }
});

test('a table sorted by a column orders its rows by it', () => {
    const linhas = [linha({ steam64Id: 'a', discordId: 'da', nome: 'Alpha', k5: 0 }), linha({ steam64Id: 'b', discordId: 'db', nome: 'Bravo', k5: 3 })];
    const html = paginaTabela({ sessao, guild, linhas, periodo: 'mes', ordem: 'pontos', ordens: { k: 'k5' } });
    const multi = html.slice(html.indexOf('id="multikills"'), html.indexOf('id="mira"'));
    assert.ok(multi.indexOf('Bravo') < multi.indexOf('Alpha'));
});

const rui = () => linha({
    steam64Id: 's2', discordId: 'd2', nome: 'Rui', formaTexto: 'VVEVV', forma: 4, sequenciaAtual: '2V', melhorSequencia: 3,
    premier: 22699, premierDelta: 1200, faceitNivel: 10, elo: 2100, eloDelta: -35,
    ctLeetify: 0.0512, tLeetify: -0.0123, assistencias: 40, assistPorPartida: 4.25, sobrevivencia: 0.42, tirosEquipa: 7,
});
const extras = () => ({
    duos: [{ a: 's1', b: 's2', partidas: 3, vitorias: 2, empates: 0, derrotas: 1, pctVitorias: 2 / 3, hltv: 1.11 }],
    mapas: [{ mapa: 'de_mirage', partidas: 12, pctVitorias: 0.58, hltv: 1.07, melhor: { steam64Id: 's2', hltv: 1.31, partidas: 5 } }],
    recordes: {
        hltv: { steam64Id: 's2', valor: 1.94, mapa: 'de_nuke', quando: '2026-10-20T21:00:00.000Z' },
        kills: { steam64Id: 's1', valor: 35, mapa: 'de_dust2', quando: '2026-10-21T21:00:00.000Z' },
        dano: null,
    },
});
const completa = (extra = {}) => paginaTabela({ sessao, guild, linhas: [linha(), rui()], periodo: 'mes', ordem: 'pontos', ordens: {}, tipo: 'todas', ...extras(), ...extra });

test('main table: form (last 5) and best win streak', () => {
    const html = completa();
    const principal = html.slice(0, html.indexOf('id="ranks"'));
    assert.match(principal, />Form</);
    assert.ok(principal.includes('🟩🟩⬜🟩🟩'));
    assert.match(principal, /title="Current streak: 2V"/);
    assert.match(principal, />Best streak</);
});

test('ranks table: Premier rating, change this month, FACEIT level and ELO', () => {
    const html = completa();
    const ranks = html.slice(html.indexOf('id="ranks"'), html.indexOf('id="utilitarios"'));
    for (const valor of ['22 699', '+1 200', '10', '2 100', '−35']) assert.ok(ranks.includes(`<td>${valor}</td>`), valor);
});

test('sides table: CT and T rating, assists, survival and shots that hit teammates', () => {
    const html = completa();
    const lados = html.slice(html.indexOf('id="lados"'), html.indexOf('id="mira"'));
    for (const valor of ['+5.12', '-1.23', '40', '4.3', '42%', '7']) assert.ok(lados.includes(`<td>${valor}</td>`), valor);
});

test('duos, maps and records sections', () => {
    const html = completa();
    const duosHtml = html.slice(html.indexOf('id="duos"'));
    assert.match(duosHtml, /Ana<\/a> \+ <a[^>]*>Rui/);
    assert.ok(duosHtml.includes('<td>2–0–1</td>'));
    assert.ok(duosHtml.includes('<td>67%</td>'));
    const mapasHtml = html.slice(html.indexOf('id="mapas"'));
    assert.match(mapasHtml, /Mirage/);
    assert.match(mapasHtml, /Rui<\/a> \(1\.31\)/);
    const recordesHtml = html.slice(html.indexOf('id="recordes"'));
    assert.match(recordesHtml, /1\.94/);
    assert.match(recordesHtml, /35 kills/);
    assert.match(recordesHtml, /Nuke/);
});

test('empty duos and records explain why', () => {
    const html = completa({ duos: [], recordes: { hltv: null, kills: null, dano: null } });
    assert.match(html.slice(html.indexOf('id="duos"')), /No duos yet/);
});

test('match type filter: links keep the period and sorts, the current one is active', () => {
    const html = completa({ tipo: 'faceit', periodo: 'mes_passado' });
    assert.match(html, /href="\/s\/g1\?periodo=mes_passado&amp;tipo=premier&amp;ordem=pontos[^"]*">Premier/);
    assert.match(html, /href="\/s\/g1\?periodo=mes_passado&amp;tipo=faceit&amp;ordem=pontos[^"]*" class="ativo">FACEIT/);
    assert.match(html, /href="\/s\/g1\?periodo=sempre&amp;tipo=faceit&amp;/);
});

test('setup and bot settings pages have the FACEIT key field', () => {
    const { paginaSetup, paginaDefinicoes } = require('../src/web/views');
    const setup = paginaSetup({ campos: { botToken: true, clientSecret: true, publicUrl: true, leetifyKey: true, faceitKey: true }, publicUrl: '', recuperacao: false, botLigado: false, erros: [] });
    assert.match(setup, /name="faceitKey"/);
    assert.match(setup, /developers\.faceit\.com/);
    const base = { sessao, publicUrl: 'https://s.example.com', orcamento: 3000, botNome: 'Bot#1', erros: [], guardado: false };
    const guardada = paginaDefinicoes({ ...base, origens: { faceitKey: 'panel' } });
    assert.match(guardada, /name="faceitKey"/);
    assert.match(guardada, /name="removeFaceitKey"/);
    const doEnv = paginaDefinicoes({ ...base, origens: { faceitKey: 'env' } });
    assert.ok(!doEnv.includes('name="faceitKey"'));
});

test('bot settings has a "Collect now" button', () => {
    const { paginaDefinicoes } = require('../src/web/views');
    const html = paginaDefinicoes({ sessao, origens: {}, publicUrl: 'https://s.example.com', orcamento: 3000, botNome: 'Bot#1', erros: [], guardado: false, recolhendo: true });
    assert.match(html, /<form[^>]*method="post"[^>]*action="\/settings\/collect"/);
    assert.match(html, /Collect now/);
    assert.match(html, /Collection started/);
});
