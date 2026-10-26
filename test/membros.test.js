const { test } = require('node:test');
const assert = require('node:assert');
const { temPermissao } = require('../src/membros');

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

test('temPermissao asks Discord, not the stale cache', async () => {

    const guild = guildFalsa(['d1'], { cache: ['d2'], permissoes: { d1: ['gerir'], d2: ['gerir'] } });
    assert.strictEqual(await temPermissao(guild, 'd1', 'gerir'), true);
    assert.strictEqual(await temPermissao(guild, 'd2', 'gerir'), false);
});

