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
    assert.deepStrictEqual(definicoes.map((c) => c.name), ['link', 'add', 'stats', 'top', 'mvp', 'stats-help']);
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
