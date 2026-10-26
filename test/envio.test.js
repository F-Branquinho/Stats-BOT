const { test } = require('node:test');
const assert = require('node:assert');
// Servers set up long before the months these tests look at
const CONFIGURADO = new Date('2026-01-01T00:00:00Z');
const { abrirBD } = require('../src/db');
const { enviarRelatorios } = require('../src/envio');

const AGORA = new Date('2026-11-01T12:00:00Z');

function preparar({ falharEnvio = false } = {}) {
    const db = abrirBD(':memory:');
    db.guardarServidor('g1', { reportChannelId: 'c1', language: 'pt', reportEnabled: true }, CONFIGURADO);
    db.ligarJogador({ discordId: 'd1', steam64Id: 's1', nome: 'Ana' });
    for (let i = 0; i < 5; i++) {
        db.guardarPartida(
            { id: `m${i}`, finished_at: `2026-10-1${i}T20:00:00.000Z`, map_name: 'de_mirage', data_source: 'matchmaking', has_banned_player: false },
            { steam64_id: 's1', rounds_count: 20, rounds_won: 13, rounds_lost: 7, total_kills: 20, total_deaths: 15, multi1k: 10, multi2k: 5 },
        );
    }
    const enviadas = [];
    const canal = {
        send: async (msg) => {
            if (falharEnvio) throw new Error('Missing Access');
            enviadas.push(msg);
        },
    };
    const guild = {
        id: 'g1',
        name: 'Server',
        members: { fetch: async (id) => ({ id }) },
        channels: { fetch: async (id) => (id === 'c1' ? canal : null) },
    };
    const client = { guilds: { cache: new Map([['g1', guild]]) } };
    return { db, client, enviadas };
}

test('sends last month report, mentions the players and marks it as sent', async () => {
    const { db, client, enviadas } = preparar();
    await enviarRelatorios({ client, db, agora: AGORA });
    assert.strictEqual(enviadas.length, 1);
    assert.match(enviadas[0].content, /outubro de 2026/);
    assert.match(enviadas[0].content, /🏆 1\. <@d1>/);
    assert.deepStrictEqual(enviadas[0].allowedMentions, { users: ['d1'] });
    assert.strictEqual(db.relatorioEnviado('g1', '2026-10'), true);
});

test('does not send twice', async () => {
    const { db, client, enviadas } = preparar();
    await enviarRelatorios({ client, db, agora: AGORA });
    await enviarRelatorios({ client, db, agora: AGORA });
    assert.strictEqual(enviadas.length, 1);
});

test('a failed send is not marked, so it is retried', async () => {
    const { db, client } = preparar({ falharEnvio: true });
    const erro = console.error;
    console.error = () => {};
    try {
        await enviarRelatorios({ client, db, agora: AGORA });
    } finally {
        console.error = erro;
    }
    assert.strictEqual(db.relatorioEnviado('g1', '2026-10'), false);
});

test('the report makes no member lookups: it is sent even if Discord member fetches fail', async () => {
    const { db, client, enviadas } = preparar();
    // Move the server to an id no other test used, so nothing is cached from before
    const guild = client.guilds.cache.get('g1');
    guild.id = 'g-sem-discord';
    guild.members.fetch = async () => { throw new Error('rate limited'); };
    client.guilds.cache = new Map([['g-sem-discord', guild]]);
    db.guardarServidor('g-sem-discord', { reportChannelId: 'c1', language: 'pt', reportEnabled: true }, CONFIGURADO);
    await enviarRelatorios({ client, db, agora: AGORA });
    assert.strictEqual(enviadas.length, 1);
    assert.match(enviadas[0].content, /<@d1>/);
});
