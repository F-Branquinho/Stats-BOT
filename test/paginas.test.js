const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { abrirBD } = require('../src/db');
const paginas = require('../src/web/paginas');

// A website with one or more fake servers, nobody logged in
async function site(guildIds = ['g1']) {
    const db = abrirBD(':memory:');
    db.ligarJogador({ discordId: 'd1', steam64Id: 's1', nome: 'Ana' });
    db.guardarPartida(
        { id: 'm1', finished_at: new Date().toISOString(), map_name: 'de_mirage', data_source: 'matchmaking', has_banned_player: false },
        { steam64_id: 's1', rounds_count: 20, rounds_won: 13, rounds_lost: 7, total_kills: 20, total_deaths: 15, multi1k: 10, multi2k: 5 },
    );
    const guilds = new Map(guildIds.map((id) => [id, {
        id, name: `Server ${id}`, icon: null, channels: { cache: new Map() },
        members: { fetch: async ({ user }) => ({ id: user }) },
    }]));
    const cliente = () => ({ user: { id: 'bot', username: 'Stats-bot', avatar: null }, guilds: { cache: guilds } });
    const app = express();
    paginas.registar(app, {
        cliente,
        db,
        obterSessao: () => null,
        exigirSessao: (req, res) => res.redirect('/login'),
        exigirCsrf: (req, res, next) => next(),
        campo: () => '',
    });
    const servidor = app.listen(0);
    const url = `http://localhost:${servidor.address().port}`;
    return { url, fechar: () => servidor.close() };
}

test('the table is public: no login needed', async () => {
    const { url, fechar } = await site();
    try {
        const res = await fetch(`${url}/s/g1`, { redirect: 'manual' });
        assert.strictEqual(res.status, 200);
        const html = await res.text();
        assert.match(html, /Server g1/);
        assert.match(html, /Ana/);
        assert.match(html, /href="\/login"/);
    } finally {
        fechar();
    }
});

test('player profiles are public too', async () => {
    const { url, fechar } = await site();
    try {
        const res = await fetch(`${url}/s/g1/p/d1`, { redirect: 'manual' });
        assert.strictEqual(res.status, 200);
        assert.match(await res.text(), /Mirage/);
    } finally {
        fechar();
    }
});

test('a server without the bot is not found', async () => {
    const { url, fechar } = await site();
    try {
        assert.strictEqual((await fetch(`${url}/s/outro`, { redirect: 'manual' })).status, 404);
    } finally {
        fechar();
    }
});

test('the home page links to the table', async () => {
    const { url, fechar } = await site(['g1']);
    try {
        assert.match(await (await fetch(url)).text(), /href="\/s\/g1"/);
    } finally {
        fechar();
    }
});

test('with several servers, the home page lists each table', async () => {
    const { url, fechar } = await site(['g1', 'g2']);
    try {
        const html = await (await fetch(url)).text();
        assert.match(html, /href="\/s\/g1"/);
        assert.match(html, /href="\/s\/g2"/);
        assert.match(html, /Server g2/);
    } finally {
        fechar();
    }
});

test('server settings still need a login', async () => {
    const { url, fechar } = await site();
    try {
        const res = await fetch(`${url}/server/g1`, { redirect: 'manual' });
        assert.strictEqual(res.status, 302);
        assert.strictEqual(res.headers.get('location'), '/login');
    } finally {
        fechar();
    }
});
