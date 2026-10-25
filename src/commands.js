const { MessageFlags, PermissionFlagsBits, RESTJSONErrorCodes, SlashCommandBuilder } = require('discord.js');
const settings = require('./settings');
const { idioma, preencher, nomeDoMes } = require('./i18n');
const { intervalo } = require('./periodos');
const { tabela, ordenarPor, MIN_PARTIDAS_MVP } = require('./leaderboard');
const { escolherVencedores } = require('./report');
const { membrosLigados } = require('./membros');

// View channels, send messages, embed links
const PERMISSOES_CONVITE = 19456;
const SEM_PINGS = { parse: [] };

const percentagem = (v) => `${Math.round(v * 100)}%`;

// /top category → table column and how its values are shown
const CATEGORIAS = {
    points: { coluna: 'pontos' },
    kills: { coluna: 'kills' },
    aim: { coluna: 'precisao', formato: percentagem },
    hs: { coluna: 'hs', formato: percentagem },
    flashes: { coluna: 'cegos' },
    teamflash: { coluna: 'teamflashes' },
    matches: { coluna: 'partidas' },
};
const PERIODOS = { month: 'mes', last_month: 'mes_passado', all: 'sempre' };

const definicoes = [
    new SlashCommandBuilder()
        .setName('link')
        .setDescription('Link your Steam account to appear in the stats'),
    new SlashCommandBuilder()
        .setName('add')
        .setDescription('Add a Steam account to the table by its Steam64 ID')
        .addStringOption((o) => o.setName('steam64').setDescription('Steam64 ID (7656119…) or steamcommunity.com/profiles/… link').setRequired(true).setMaxLength(100))
        .addUserOption((o) => o.setName('user').setDescription('Whose account it is (defaults to you; others need Manage Server)')),
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription("This month's stats of a player")
        .addUserOption((o) => o.setName('user').setDescription('Whose stats (defaults to you)')),
    new SlashCommandBuilder()
        .setName('top')
        .setDescription('Top 10 of this server by category')
        .addStringOption((o) => o.setName('category').setDescription('What to rank by (default: points)').addChoices(
            { name: 'Points', value: 'points' },
            { name: 'Kills', value: 'kills' },
            { name: 'Aim (accuracy)', value: 'aim' },
            { name: 'Headshot %', value: 'hs' },
            { name: 'Enemies flashed', value: 'flashes' },
            { name: 'Team flashes', value: 'teamflash' },
            { name: 'Matches', value: 'matches' },
        ))
        .addStringOption((o) => o.setName('period').setDescription('Default: this month').addChoices(
            { name: 'This month', value: 'month' },
            { name: 'Last month', value: 'last_month' },
            { name: 'All time', value: 'all' },
        )),
    new SlashCommandBuilder()
        .setName('mvp')
        .setDescription("This month's MVP race"),
    new SlashCommandBuilder()
        .setName('stats-help')
        .setDescription('Explain what the bot does and list its commands'),
].map((c) => c.toJSON());

/** "55 pts · 7V 1E 4D · HLTV 1.08 · 210 kills · K/D 1.17 · HS 46% · 💡 41 · 🤦 9 · 12 partidas" */
function linhaStats(l, codigo) {
    const t = idioma(codigo);
    return [
        `${l.pontos} pts`,
        `${l.vitorias}${t.resultado.V} ${l.empates}${t.resultado.E} ${l.derrotas}${t.resultado.D}`,
        `HLTV ${l.hltv.toFixed(2)}`,
        `${l.kills} kills`,
        `K/D ${l.kd.toFixed(2)}`,
        `HS ${percentagem(l.hs)}`,
        `🎯 ${percentagem(l.precisao)}`,
        `💡 ${l.cegos} (${percentagem(l.flashPct)})`,
        `🤦 ${l.teamflashes} (${percentagem(l.tfPct)})`,
        `${l.partidas} ${t.partidasN}`,
    ].join(' · ');
}

/** Up to 10 lines "1. <@id> — value" for a /top category. */
function linhasTop(linhas, categoria, mencao) {
    const { coluna, formato = String } = CATEGORIAS[categoria];
    return linhas.slice(0, 10).map((l, i) => `${i + 1}. ${mencao(l.steam64Id)} — ${formato(l[coluna])}`).join('\n');
}

function nomePeriodo(periodo, codigo) {
    const { mes } = intervalo(periodo);
    return mes ? nomeDoMes(mes, codigo) : idioma(codigo).cmd.sempre;
}

/** Link to add the bot to a server (preselected when guildId is given). */
function urlConvite(clientId, guildId) {
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('scope', 'bot applications.commands');
    url.searchParams.set('permissions', String(PERMISSOES_CONVITE));
    if (guildId) {
        url.searchParams.set('guild_id', guildId);
        url.searchParams.set('disable_guild_select', 'true');
    }
    return url.toString();
}

/**
 * Registers the commands in a server. Server commands are available right away, unlike global ones.
 * @param {import('discord.js').Guild} guild
 */
async function registarComandos(guild) {
    try {
        await guild.commands.set(definicoes);
        console.log(`⌨ Slash commands registered in ${guild.name}`);
    } catch (error) {
        if (error.code !== RESTJSONErrorCodes.MissingAccess) throw error;
        console.error(
            `❌ Missing permission to register slash commands in ${guild.name}. Re-invite the bot with this link:\n`
            + `   ${urlConvite(guild.client.user.id, guild.id)}`,
        );
    }
}

/** A Steam64 ID from the ID itself or a steamcommunity.com/profiles/ link, or null. */
function lerSteam64(texto) {
    const t = String(texto ?? '').trim();
    const id = /^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/profiles\/(\d+)\/?$/i.exec(t)?.[1] ?? t;
    return /^7656119\d{10}$/.test(id) ? id : null;
}

/**
 * /add: links a Steam64 ID to a Discord user (yourself, or anyone with Manage Server)
 * and fetches their matches right away.
 * @returns {Promise<{ ok: true, steam64Id: string, novas: number | null, estado: string } | { ok: false, motivo: 'invalido' | 'sem_permissao' | 'steam_ocupada' }>}
 */
async function ligarPorComando({ db: bd, recolha: rc, leetify: lt = null, autorId, alvo, texto, podeGerir }) {
    const steam64Id = lerSteam64(texto);
    if (!steam64Id) return { ok: false, motivo: 'invalido' };
    if (alvo.id !== autorId && !podeGerir) return { ok: false, motivo: 'sem_permissao' };
    // Admins can move an account that was linked to the wrong person
    const ligacao = bd.ligarJogador({ discordId: alvo.id, steam64Id, nome: alvo.nome, avatar: alvo.avatar, forcar: podeGerir });
    if (!ligacao.ok) return ligacao;
    const movidoDe = ligacao.movidoDe ?? null;
    console.log(`🔗 ${alvo.nome} (${alvo.id}) linked Steam ${steam64Id} with /add (by ${autorId})`);

    let novas = null;
    try {
        novas = await rc.recolherJogador(steam64Id);
    } catch (error) {
        // Linked anyway: the next collection fetches the matches
        console.error(`❌ Could not fetch matches of ${steam64Id}:`, error.message);
    }
    // The Leetify name confirms the right account was linked, and tells private profiles from missing ones
    const leetify = lt ? await lt.miniPerfil(steam64Id) : null;
    return { ok: true, steam64Id, novas, estado: bd.jogadorPorSteam(steam64Id).leetify_status, movidoDe, leetify };
}

/** The /add reply for a ligarPorComando result. */
function respostaAdd(r, t, jogador) {
    if (!r.ok) return preencher(t.cmd.add[r.motivo], { jogador });
    const vars = { jogador, steam: r.steam64Id, nome: r.leetify?.nome ?? r.steam64Id, n: r.novas };
    let texto;
    if (r.estado === 'ok') texto = preencher(r.novas === null ? t.cmd.add.depois : t.cmd.add.ok, vars);
    else if (r.leetify?.existe === false) texto = preencher(t.cmd.add.semConta, vars);
    else if (r.leetify?.existe) texto = preencher(t.cmd.add.privado, vars);
    else texto = preencher(t.cmd.add.semLeetify, vars);
    return r.movidoDe ? `${texto}\n${preencher(t.cmd.add.movido, { antigo: `<@${r.movidoDe}>` })}` : texto;
}

let db = null;
let recolha = null;
let leetify = null;

/** The database, collector and Leetify client the commands use (set once at startup). */
function definirBD(bd, rc = null, lt = null) {
    db = bd;
    recolha = rc;
    leetify = lt;
}

async function linhasDoServidor(guild, periodo) {
    const jogadores = await membrosLigados(guild, db.jogadoresLigados());
    const discordDe = new Map(jogadores.map((j) => [j.steam64_id, j.discord_id]));
    return { linhas: tabela(db, [...discordDe.keys()], periodo), mencao: (s) => `<@${discordDe.get(s)}>` };
}

const COMANDOS = {
    async link(interaction, t) {
        const { publicUrl } = settings.obter();
        const content = publicUrl ? preencher(t.cmd.link, { url: `${publicUrl}/link` }) : t.cmd.semSite;
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    },

    async add(interaction, t) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const user = interaction.options.getUser('user') ?? interaction.user;
        const r = await ligarPorComando({
            db,
            recolha,
            leetify,
            autorId: interaction.user.id,
            alvo: { id: user.id, nome: user.globalName ?? user.username, avatar: user.avatar },
            texto: interaction.options.getString('steam64'),
            podeGerir: Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)),
        });
        await interaction.editReply({ content: respostaAdd(r, t, `<@${user.id}>`), allowedMentions: SEM_PINGS });
    },

    async stats(interaction, t, codigo) {
        const alvo = interaction.options.getUser('user') ?? interaction.user;
        const jogador = `<@${alvo.id}>`;
        const periodo = nomePeriodo('mes', codigo);
        const j = db.jogador(alvo.id);
        const privado = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: SEM_PINGS });
        if (!j) return privado(alvo.id === interaction.user.id ? t.cmd.naoLigadoTu : preencher(t.cmd.naoLigado, { jogador }));
        if (j.leetify_status !== 'ok') return privado(preencher(t.cmd.semLeetify, { jogador }));

        const [linha] = tabela(db, [j.steam64_id], 'mes');
        const content = linha
            ? preencher(t.cmd.stats, { jogador, periodo, linha: linhaStats(linha, codigo) })
            : preencher(t.cmd.semPartidas, { jogador, periodo });
        await interaction.reply({ content, allowedMentions: SEM_PINGS });
    },

    async top(interaction, t, codigo) {
        await interaction.deferReply();
        const categoria = interaction.options.getString('category') ?? 'points';
        const periodo = PERIODOS[interaction.options.getString('period') ?? 'month'];
        const nome = nomePeriodo(periodo, codigo);
        const { linhas, mencao } = await linhasDoServidor(interaction.guild, periodo);
        const content = linhas.length
            ? `${preencher(t.cmd.top, { categoria: t.cmd.categorias[categoria], periodo: nome })}\n`
                + linhasTop(ordenarPor(linhas, CATEGORIAS[categoria].coluna), categoria, mencao)
            : preencher(t.cmd.topVazio, { periodo: nome });
        await interaction.editReply({ content, allowedMentions: SEM_PINGS });
    },

    async mvp(interaction, t, codigo) {
        await interaction.deferReply();
        const nome = nomePeriodo('mes', codigo);
        const { linhas, mencao } = await linhasDoServidor(interaction.guild, 'mes');
        const { top } = escolherVencedores(linhas);
        const fora = linhas.length - linhas.filter((l) => l.elegivel).length;
        const partes = top.length
            ? [preencher(t.cmd.mvp, { periodo: nome }), linhasTop(top, 'points', mencao)]
            : [preencher(t.cmd.mvpVazio, { minimo: MIN_PARTIDAS_MVP, periodo: nome })];
        if (fora > 0) partes.push(preencher(t.cmd.mvpFora, { n: fora, minimo: MIN_PARTIDAS_MVP }));
        await interaction.editReply({ content: partes.join('\n'), allowedMentions: SEM_PINGS });
    },

    async 'stats-help'(interaction, t) {
        const { publicUrl } = settings.obter();
        const url = publicUrl ? `${publicUrl}/s/${interaction.guildId}` : '—';
        await interaction.reply({ content: preencher(t.cmd.ajuda, { minimo: MIN_PARTIDAS_MVP, url }), flags: MessageFlags.Ephemeral });
    },
};

async function tratarInteracao(interaction) {
    if (!interaction.isChatInputCommand() || !interaction.inGuild()) return;
    const comando = COMANDOS[interaction.commandName];
    if (!comando) return;
    const codigo = db.servidor(interaction.guildId).language;
    try {
        await comando(interaction, idioma(codigo), codigo);
    } catch (error) {
        console.error(`❌ /${interaction.commandName} failed:`, error);
        const resposta = { content: '❌ Something went wrong, try again in a moment.', flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) await interaction.editReply(resposta).catch(() => {});
        else await interaction.reply(resposta).catch(() => {});
    }
}

module.exports = {
    CATEGORIAS, PERMISSOES_CONVITE, definicoes, linhaStats, linhasTop, lerSteam64, ligarPorComando, respostaAdd, urlConvite, registarComandos, definirBD, tratarInteracao,
};
