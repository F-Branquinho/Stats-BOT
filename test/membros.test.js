const { test } = require('node:test');
const assert = require('node:assert');
const { criarMembros } = require('../src/membros');

const jogadores = [{ discord_id: 'd1', steam64_id: 's1' }, { discord_id: 'd2', steam64_id: 's2' }];

// Like discord.js: without force, a member in the cache is returned even after they left
function guildFalsa(membros, { cache = [], permissoes = {} } = {}) {
    const pedidos = [];
    return {
        pedidos,
        id: 'g1',
        members: {
            fetch: async (opcoes) => {
                const id = typeof opcoes === 'string' ? opcoes : opcoes.user;
                const membro = { id, permissions: { has: (p) => (permissoes[id] ?? []).includes(p) } };
                if (!opcoes.force && cache.includes(id)) return membro;
                pedidos.push(id);
                if (membros.includes(id)) return membro;
                throw Object.assign(new Error('Unknown Member'), { code: 10007 });
            },
        },
    };
}

test('a member who left is left out even if discord.js still has them cached', async () => {
    const { membrosLigados } = criarMembros();
    const guild = guildFalsa([], { cache: ['d1'] });
    assert.deepStrictEqual(await membrosLigados(guild, jogadores), []);
});

test('temPermissao asks Discord, not the stale cache', async () => {
    const { temPermissao } = criarMembros();
    const guild = guildFalsa(['d1'], { cache: ['d2'], permissoes: { d1: ['gerir'], d2: ['gerir'] } });
    assert.strictEqual(await temPermissao(guild, 'd1', 'gerir'), true);
    assert.strictEqual(await temPermissao(guild, 'd2', 'gerir'), false);
});

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
