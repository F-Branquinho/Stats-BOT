const { test } = require('node:test');
const assert = require('node:assert');
const { criarMembros } = require('../src/membros');

function guildFalsa(membros) {
    const pedidos = [];
    return {
        pedidos,
        id: 'g1',
        members: {
            fetch: async (id) => {
                pedidos.push(id);
                if (membros.includes(id)) return { id };
                throw Object.assign(new Error('Unknown Member'), { code: 10007 });
            },
        },
    };
}

const jogadores = [{ discord_id: 'd1', steam64_id: 's1' }, { discord_id: 'd2', steam64_id: 's2' }];

test('members who left the server are left out', async () => {
    const { membrosLigados } = criarMembros();
    const guild = guildFalsa(['d1']);
    assert.deepStrictEqual(await membrosLigados(guild, jogadores), [jogadores[0]]);
});

test('results are cached for 10 minutes per guild and player', async () => {
    let agora = 0;
    const { membrosLigados } = criarMembros({ agora: () => agora });
    const guild = guildFalsa(['d1']);
    await membrosLigados(guild, jogadores);
    await membrosLigados(guild, jogadores);
    assert.strictEqual(guild.pedidos.length, 2);
    agora = 10 * 60 * 1000;
    await membrosLigados(guild, jogadores);
    assert.strictEqual(guild.pedidos.length, 4);
});

test('other Discord errors are not hidden', async () => {
    const { membrosLigados } = criarMembros();
    const guild = { id: 'g1', members: { fetch: async () => { throw Object.assign(new Error('Service unavailable'), { status: 503 }); } } };
    await assert.rejects(membrosLigados(guild, jogadores), /Service unavailable/);
});
