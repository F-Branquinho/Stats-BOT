const { RESTJSONErrorCodes } = require('discord.js');

const CACHE_MS = 10 * 60 * 1000;

/**
 * Fetches a member from Discord, or null if they aren't in the server. Always skips the
 * discord.js cache: without the Server Members intent, the bot never hears that someone left
 * or lost a role, so a cached member can be stale forever.
 */
async function buscarMembro(guild, discordId) {
    try {
        return await guild.members.fetch({ user: discordId, force: true });
    } catch (error) {
        if (error.code !== RESTJSONErrorCodes.UnknownMember && error.code !== RESTJSONErrorCodes.UnknownUser) throw error;
        return null;
    }
}

/**
 * Which linked players are members of a server. Each member is fetched by id (no privileged
 * Server Members intent needed) and the answer is cached here for 10 minutes.
 */
function criarMembros({ agora = () => Date.now() } = {}) {
    const cache = new Map();

    async function eMembro(guild, discordId) {
        const chave = `${guild.id}:${discordId}`;
        const guardado = cache.get(chave);
        if (guardado && agora() - guardado.em < CACHE_MS) return guardado.membro;
        const membro = Boolean(await buscarMembro(guild, discordId));
        cache.set(chave, { membro, em: agora() });
        return membro;
    }

    /** Checked live on every call (used for access to the server settings). */
    async function temPermissao(guild, discordId, permissao) {
        const membro = await buscarMembro(guild, discordId);
        return Boolean(membro?.permissions.has(permissao));
    }

    /** @param {{ discord_id: string }[]} jogadores rows from db.jogadoresLigados() */
    async function membrosLigados(guild, jogadores) {
        const resultado = [];
        for (const j of jogadores) if (await eMembro(guild, j.discord_id)) resultado.push(j);
        return resultado;
    }

    return { membrosLigados, temPermissao };
}

module.exports = { criarMembros, ...criarMembros() };
