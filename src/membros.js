const { RESTJSONErrorCodes } = require('discord.js');

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

/** Whether a user has a permission in a server, checked live (used for access to the server settings). */
async function temPermissao(guild, discordId, permissao) {
    const membro = await buscarMembro(guild, discordId);
    return Boolean(membro?.permissions.has(permissao));
}

module.exports = { temPermissao };
