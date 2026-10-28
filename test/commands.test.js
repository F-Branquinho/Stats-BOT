const { test } = require('node:test');
const assert = require('node:assert');
const { definicoes, linhaStats, linhasTop, lerSteam64, ligarPorComando, CATEGORIAS } = require('../src/commands');
const { abrirBD } = require('../src/db');

const linha = {
    steam64Id: 's1', partidas: 12, vitorias: 7, empates: 1, derrotas: 4, pontos: 55, hltv: 1.08,
    kills: 210, deaths: 180, kd: 1.17, hs: 0.456, precisao: 0.31, flashes: 60, cegos: 41, teamflashes: 9,
    leetify: 0.02, aim: 72.4, elegivel: true,
};

test('command names', () => {
    assert.deepStrictEqual(definicoes.map((c) => c.name), ['link', 'add', 'remove', 'refresh', 'table', 'stats', 'top', 'mvp', 'stats-help']);
});

test('/add takes a required steam64 and an optional user', () => {
    const add = definicoes.find((c) => c.name === 'add');
    assert.deepStrictEqual(add.options.map((o) => [o.name, Boolean(o.required)]), [['steam64', true], ['user', false]]);
});

test('lerSteam64 accepts the id and profile links', () => {
    assert.strictEqual(lerSteam64('76561198053742791'), '76561198053742791');
    assert.strictEqual(lerSteam64('  76561198053742791 '), '76561198053742791');
    assert.strictEqual(lerSteam64('https://steamcommunity.com/profiles/76561198053742791/'), '76561198053742791');
    assert.strictEqual(lerSteam64('steamcommunity.com/profiles/76561198053742791'), '76561198053742791');
});

test('lerSteam64 refuses anything else', () => {
    for (const mau of ['', 'abc', '12345', '7656119805374279', '765611980537427912', 'https://steamcommunity.com/id/nome', '86561198053742791']) {
        assert.strictEqual(lerSteam64(mau), null, mau);
    }
});

function contexto(mini = { existe: true, publico: true, nome: 'Ana CS' }) {
    const db = abrirBD(':memory:');
    const recolhidos = [];
    const recolha = { recolherJogador: async (s) => { recolhidos.push(s); return 7; } };
    const leetify = { miniPerfil: async () => mini };
    return { db, recolha, leetify, recolhidos };
}
const ana = { id: 'd1', nome: 'Ana', avatar: null };
const rui = { id: 'd2', nome: 'Rui', avatar: 'abc' };

test('ligarPorComando links yourself and fetches the matches right away', async () => {
    const { db, recolha, leetify, recolhidos } = contexto();
    const r = await ligarPorComando({ db, recolha, leetify, autorId: 'd1', alvo: ana, texto: '76561198053742791', podeGerir: false });
    assert.deepStrictEqual(r, { ok: true, steam64Id: '76561198053742791', novas: 7, estado: 'ok', movidoDe: null, leetify: { existe: true, publico: true, nome: 'Ana CS' } });
    assert.strictEqual(db.jogador('d1').steam64_id, '76561198053742791');
    assert.deepStrictEqual(recolhidos, ['76561198053742791']);
});

test('ligarPorComando: invalid id', async () => {
    const { db, recolha, leetify, recolhidos } = contexto();
    assert.deepStrictEqual(await ligarPorComando({ db, recolha, leetify, autorId: 'd1', alvo: ana, texto: 'abc', podeGerir: false }), { ok: false, motivo: 'invalido' });
    assert.deepStrictEqual(recolhidos, []);
});

test('ligarPorComando: linking someone else needs Manage Server', async () => {
    const { db, recolha, leetify } = contexto();
    assert.deepStrictEqual(await ligarPorComando({ db, recolha, leetify, autorId: 'd1', alvo: rui, texto: '76561198053742791', podeGerir: false }), { ok: false, motivo: 'sem_permissao' });
    assert.strictEqual(db.jogador('d2'), undefined);
    const r = await ligarPorComando({ db, recolha, leetify, autorId: 'd1', alvo: rui, texto: '76561198053742791', podeGerir: true });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(db.jogador('d2').name, 'Rui');
});

test('ligarPorComando: a Steam account linked to someone else is refused', async () => {
    const { db, recolha, leetify } = contexto();
    db.ligarJogador({ discordId: 'd2', steam64Id: '76561198053742791', nome: 'Rui' });
    assert.deepStrictEqual(await ligarPorComando({ db, recolha, leetify, autorId: 'd1', alvo: ana, texto: '76561198053742791', podeGerir: false }), { ok: false, motivo: 'steam_ocupada' });
    assert.strictEqual(db.jogadorPorSteam('76561198053742791').discord_id, 'd2');
});

test('ligarPorComando: with Manage Server, a Steam account moves to the right person', async () => {
    const { db, recolha, leetify } = contexto();
    db.ligarJogador({ discordId: 'd1', steam64Id: '76561198053742791', nome: 'Ana' });
    const r = await ligarPorComando({ db, recolha, leetify, autorId: 'd1', alvo: rui, texto: '76561198053742791', podeGerir: true });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.movidoDe, 'd1');
    assert.strictEqual(db.jogadorPorSteam('76561198053742791').discord_id, 'd2');
    assert.strictEqual(db.jogador('d1'), undefined);
});

test('ligarPorComando: Leetify not finding the profile is reported', async () => {
    const { db, leetify } = contexto();
    const recolha = { recolherJogador: async (s) => { db.marcarEstado(s, 'not_found'); return 0; } };
    const r = await ligarPorComando({ db, recolha, leetify, autorId: 'd1', alvo: ana, texto: '76561198053742791', podeGerir: false });
    assert.strictEqual(r.novas, 0);
    assert.strictEqual(r.estado, 'not_found');
});

test('ligarPorComando: a Leetify outage still links, without matches yet', async () => {
    const { db, leetify } = contexto();
    const recolha = { recolherJogador: async () => { throw new Error('Leetify answered 502'); } };
    const erro = console.error;
    console.error = () => {};
    try {
        const r = await ligarPorComando({ db, recolha, leetify, autorId: 'd1', alvo: ana, texto: '76561198053742791', podeGerir: false });
        assert.strictEqual(r.novas, null);
    assert.strictEqual(r.estado, 'ok');
    } finally {
        console.error = erro;
    }
});

test('/top choices for category and period', () => {
    const top = definicoes.find((c) => c.name === 'top');
    const escolhas = (nome) => top.options.find((o) => o.name === nome).choices.map((c) => c.value);
    assert.deepStrictEqual(escolhas('category'), ['kills', 'adr', 'aim', 'hs', 'flashes', 'flashpct', 'teamflash', 'hedmg', 'ace', 'k3', 'tradepct', 'matches']);
    assert.strictEqual(top.options.find((o) => o.name === 'category').required, true);
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
    assert.strictEqual(linhasTop([linha], 'kills', (s) => s), '1. s1 — 210');
});

test('every /add reply exists in Portuguese and English', () => {
    const { IDIOMAS } = require('../src/i18n');
    for (const [codigo, t] of Object.entries(IDIOMAS)) {
        for (const chave of ['ok', 'depois', 'semLeetify', 'invalido', 'sem_permissao', 'steam_ocupada']) {
            assert.ok(typeof t.cmd.add?.[chave] === 'string' && t.cmd.add[chave].length > 0, `${codigo}.cmd.add.${chave}`);
        }
        assert.match(t.cmd.ajuda, /\/add/, `${codigo} help lists /add`);
    }
});

test('ligarPorComando reports a private Leetify profile with its name', async () => {
    const { db, leetify } = contexto({ existe: true, publico: false, nome: 'Spooked' });
    const recolha = { recolherJogador: async (s) => { db.marcarEstado(s, 'not_found'); return 0; } };
    const r = await ligarPorComando({ db, recolha, leetify, autorId: 'd1', alvo: ana, texto: '76561198053742791', podeGerir: false });
    assert.deepStrictEqual(r.leetify, { existe: true, publico: false, nome: 'Spooked' });
});

test('ligarPorComando works when the mini-profile is unavailable', async () => {
    const { db, recolha, leetify } = contexto(null);
    const r = await ligarPorComando({ db, recolha, leetify, autorId: 'd1', alvo: ana, texto: '76561198053742791', podeGerir: false });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.leetify, null);
});

test('every /add reply exists in Portuguese and English (v0.4.0)', () => {
    const { IDIOMAS } = require('../src/i18n');
    for (const [codigo, t] of Object.entries(IDIOMAS)) {
        for (const chave of ['privado', 'semConta', 'movido']) {
            assert.ok(typeof t.cmd.add?.[chave] === 'string' && t.cmd.add[chave].length > 0, `${codigo}.cmd.add.${chave}`);
        }
    }
});

test('respostaAdd picks the right message', () => {
    const { respostaAdd } = require('../src/commands');
    const { idioma } = require('../src/i18n');
    const t = idioma('en');
    const base = { ok: true, steam64Id: '76561198053742791', novas: 3, estado: 'ok', movidoDe: null, leetify: { existe: true, publico: true, nome: 'Ana CS' } };
    assert.match(respostaAdd(base, t, '<@d1>'), /Ana CS.*3 new matches/);
    assert.match(respostaAdd({ ...base, estado: 'not_found', leetify: { existe: true, publico: false, nome: 'Spooked' } }, t, '<@d1>'), /Spooked.*private/);
    assert.match(respostaAdd({ ...base, estado: 'not_found', leetify: { existe: false, publico: false, nome: null } }, t, '<@d1>'), /no Leetify account/);
    assert.match(respostaAdd({ ...base, estado: 'not_found', leetify: null }, t, '<@d1>'), /couldn't find the profile/);
    assert.match(respostaAdd({ ...base, movidoDe: 'd9' }, t, '<@d1>'), /<@d9>/);
    assert.match(respostaAdd({ ok: false, motivo: 'steam_ocupada' }, t, '<@d1>'), /already linked/);
});

test('linhaStats shows Flash % and TF %', () => {
    const texto = linhaStats({ ...linha, flashPct: 0.683, tfPct: 0.15 }, 'pt');
    assert.match(texto, /💡 41 \(68%\)/);
    assert.match(texto, /🤦 9 \(15%\)/);
});

test('linhaStats shows HE damage', () => {
    assert.match(linhaStats({ ...linha, flashPct: 0, tfPct: 0, heDano: 312.6 }, 'en'), /💥 HE 313/);
});

test('/table answers with a link button to this server\'s table', () => {
    const { respostaTable } = require('../src/commands');
    const { idioma } = require('../src/i18n');
    const r = respostaTable({ publicUrl: 'https://stats.example.com', guildId: '123', t: idioma('pt') });
    const json = JSON.parse(JSON.stringify(r));
    assert.strictEqual(json.components[0].components[0].url, 'https://stats.example.com/s/123');
    assert.strictEqual(json.components[0].components[0].style, 5);
    assert.ok(json.flags);
    const semSite = respostaTable({ publicUrl: null, guildId: '123', t: idioma('pt') });
    assert.match(semSite.content, /site/);
    assert.strictEqual(semSite.components, undefined);
});

test('linhasTop formats the new categories, with "—" for missing values', () => {
    const base = { ...linha, adr: 88.4, heDano: 1478.2, k5: 2, k3: 28, tradePct: 0.48, flashPct: 0.63 };
    assert.strictEqual(linhasTop([base], 'adr', (s) => s), '1. s1 — 88');
    assert.strictEqual(linhasTop([base], 'hedmg', (s) => s), '1. s1 — 1478');
    assert.strictEqual(linhasTop([base], 'ace', (s) => s), '1. s1 — 2');
    assert.strictEqual(linhasTop([base], 'k3', (s) => s), '1. s1 — 28');
    assert.strictEqual(linhasTop([base], 'tradepct', (s) => s), '1. s1 — 48%');
    assert.strictEqual(linhasTop([base], 'flashpct', (s) => s), '1. s1 — 63%');
    assert.strictEqual(linhasTop([{ ...base, adr: null }], 'adr', (s) => s), '1. s1 — —');
});

function corrida(n, extra = {}) {
    return {
        ...linha, steam64Id: `s${n}`, pontos: 100 - n * 7, vitorias: 10 - n, empates: 1, derrotas: n, hltv: 1.2 - n / 100,
        partidas: 10, elegivel: true, kills: 300 - n, precisao: 0.3, hs: 0.4, cegos: 50 - n, teamflashes: 5, ...extra,
    };
}

test('mensagemMvp: race with gap to the leader, players still short of 5 matches and award leaders', () => {
    const { mensagemMvp } = require('../src/commands');
    const linhas = [corrida(1), corrida(2), corrida(3, { elegivel: false, partidas: 3, pontos: 200 })];
    const texto = mensagemMvp({ linhas, idioma: 'pt', mencao: (s) => `<@${s}>`, periodo: 'outubro de 2026' });
    const l = texto.split('\n');
    assert.match(texto, /outubro de 2026/);
    assert.ok(l.some((x) => x.startsWith('🏆 1. <@s1> — 93 pts · 9V 1E 1D · HLTV 1.19')), texto);
    assert.ok(l.some((x) => x.startsWith('2. <@s2> — 86 pts (−7)')), texto);
    assert.match(texto, /<@s3> \(3\/5, faltam 2\)/);
    assert.match(texto, /🔫 <@s1>/);
    assert.match(texto, /🎮 <@s1>/);
    assert.ok(texto.length <= 2000);
});

test('mensagemMvp: nobody eligible yet', () => {
    const { mensagemMvp } = require('../src/commands');
    const texto = mensagemMvp({ linhas: [corrida(1, { elegivel: false, partidas: 2 })], idioma: 'en', mencao: (s) => s, periodo: 'October 2026' });
    assert.match(texto, /Nobody has 5 matches/);
    assert.match(texto, /s1 \(2\/5, 3 to go\)/);
});

test('mensagemMvp: a long race still fits in one Discord message', () => {
    const { mensagemMvp } = require('../src/commands');
    const linhas = Array.from({ length: 30 }, (_, i) => corrida(i + 1, i >= 12 ? { elegivel: false, partidas: 4 } : {}));
    const texto = mensagemMvp({ linhas, idioma: 'pt', mencao: (s) => `<@1234567890123456${String(s).slice(1).padStart(2, '0')}>`, periodo: 'outubro de 2026' });
    assert.ok(texto.length <= 2000, String(texto.length));
});

test('/remove takes an optional user or steam64', () => {
    const remove = definicoes.find((c) => c.name === 'remove');
    assert.deepStrictEqual(remove.options.map((o) => [o.name, Boolean(o.required)]), [['user', false], ['steam64', false]]);
});

test('removerPorComando: anyone can remove themselves', () => {
    const { removerPorComando } = require('../src/commands');
    const db = abrirBD(':memory:');
    db.ligarJogador({ discordId: 'd1', steam64Id: '76561198053742791', nome: 'Ana' });
    assert.deepStrictEqual(removerPorComando({ db, autorId: 'd1', alvoId: 'd1', texto: null, podeGerir: false }), { ok: true, discordId: 'd1', steam64Id: '76561198053742791' });
    assert.strictEqual(db.jogador('d1'), undefined);
});

test('removerPorComando: removing someone else needs Manage Server', () => {
    const { removerPorComando } = require('../src/commands');
    const db = abrirBD(':memory:');
    db.ligarJogador({ discordId: 'd2', steam64Id: '76561198053742791', nome: 'Rui' });
    assert.deepStrictEqual(removerPorComando({ db, autorId: 'd1', alvoId: 'd2', texto: null, podeGerir: false }), { ok: false, motivo: 'sem_permissao' });
    assert.ok(db.jogador('d2'));
    assert.strictEqual(removerPorComando({ db, autorId: 'd1', alvoId: 'd2', texto: null, podeGerir: true }).ok, true);
    assert.strictEqual(db.jogador('d2'), undefined);
});

test('removerPorComando: by Steam64 ID (admins), and the not-linked and invalid cases', () => {
    const { removerPorComando } = require('../src/commands');
    const db = abrirBD(':memory:');
    db.ligarJogador({ discordId: 'd2', steam64Id: '76561198053742791', nome: 'Rui' });
    assert.deepStrictEqual(removerPorComando({ db, autorId: 'd1', alvoId: null, texto: 'abc', podeGerir: true }), { ok: false, motivo: 'invalido' });
    assert.deepStrictEqual(removerPorComando({ db, autorId: 'd1', alvoId: null, texto: '76561198094900436', podeGerir: true }), { ok: false, motivo: 'nao_ligado' });
    assert.deepStrictEqual(removerPorComando({ db, autorId: 'd1', alvoId: null, texto: '76561198053742791', podeGerir: false }), { ok: false, motivo: 'sem_permissao' });
    assert.strictEqual(removerPorComando({ db, autorId: 'd1', alvoId: null, texto: 'https://steamcommunity.com/profiles/76561198053742791', podeGerir: true }).ok, true);
    assert.deepStrictEqual(removerPorComando({ db, autorId: 'd3', alvoId: 'd3', texto: null, podeGerir: false }), { ok: false, motivo: 'nao_ligado' });
});

test('every /remove reply exists in Portuguese and English', () => {
    const { IDIOMAS } = require('../src/i18n');
    for (const [codigo, t] of Object.entries(IDIOMAS)) {
        for (const chave of ['ok', 'invalido', 'sem_permissao', 'nao_ligado']) {
            assert.ok(typeof t.cmd.remove?.[chave] === 'string' && t.cmd.remove[chave].length > 0, `${codigo}.cmd.remove.${chave}`);
        }
        assert.match(t.cmd.ajuda, /\/remove/, `${codigo} help lists /remove`);
    }
});

test('refrescar: only members with Manage Server can start a collection', async () => {
    const { refrescar } = require('../src/commands');
    let chamadas = 0;
    const recolha = { recolherTudo: async () => { chamadas++; return { novas: 12, jogadores: 7, parado: null }; } };
    assert.deepStrictEqual(await refrescar({ recolha, podeGerir: false }), { ok: false, motivo: 'sem_permissao' });
    assert.strictEqual(chamadas, 0);
    assert.deepStrictEqual(await refrescar({ recolha, podeGerir: true }), { ok: true, novas: 12, jogadores: 7, parado: null });
    assert.strictEqual(chamadas, 1);
});

test('every /refresh reply exists in Portuguese and English', () => {
    const { IDIOMAS } = require('../src/i18n');
    for (const [codigo, t] of Object.entries(IDIOMAS)) {
        for (const chave of ['ok', 'limite', 'orcamento', 'sem_permissao']) {
            assert.ok(typeof t.cmd.refresh?.[chave] === 'string' && t.cmd.refresh[chave].length > 0, `${codigo}.cmd.refresh.${chave}`);
        }
        assert.match(t.cmd.ajuda, /\/refresh/, `${codigo} help lists /refresh`);
    }
});
