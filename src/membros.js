const { RESTJSONErrorCodes } = require('discord.js');

const CACHE_MS = 10 * 60 * 1000;

/**
 * Which linked players are members of a server. Each member is fetched by id (no privileged
 * Server Members intent needed) and the answer is cached for 10 minutes.
 */
function criarMembros({ agora = () => Date.now() } = {}) {
    const cache = new Map();

    async function eMembro(guild, discordId) {
        const chave = `${guild.id}:${discordId}`;
        const guardado = cache.get(chave);
        if (guardado && agora() - guardado.em < CACHE_MS) return guardado.membro;
        let membro;
        try {
            await guild.members.fetch(discordId);
            membro = true;
        } catch (error) {
            if (error.code !== RESTJSONErrorCodes.UnknownMember && error.code !== RESTJSONErrorCodes.UnknownUser) throw error;
            membro = false;
        }
        cache.set(chave, { membro, em: agora() });
        return membro;
    }

    /** @param {{ discord_id: string }[]} jogadores rows from db.jogadoresLigados() */
    async function membrosLigados(guild, jogadores) {
        const resultado = [];
        for (const j of jogadores) if (await eMembro(guild, j.discord_id)) resultado.push(j);
        return resultado;
    }

    return { membrosLigados };
}

module.exports = { criarMembros, ...criarMembros() };
