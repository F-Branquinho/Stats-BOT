const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits, RESTJSONErrorCodes, SlashCommandBuilder,
} = require('discord.js');
const settings = require('./settings');
const { idioma, preencher, nomeDoMes } = require('./i18n');
const { intervalo } = require('./periodos');
const { tabela, ordenarPor, MIN_PARTIDAS_MVP } = require('./leaderboard');
const { EMOJIS, escolherVencedores } = require('./report');

// View channels, send messages, embed links
const PERMISSOES_CONVITE = 19456;
const SEM_PINGS = { parse: [] };

const percentagem = (v) => `${Math.round(v * 100)}%`;

// Values can be missing (matches stored before a column existed): shown as "—"
const ou = (formato) => (v) => (typeof v === 'number' ? formato(v) : '—');
const inteiro = ou((v) => String(Math.round(v)));

// /top category → table column and how its values are shown (points are /mvp)
const CATEGORIAS = {
    kills: { coluna: 'kills', nome: 'Kills' },
    adr: { coluna: 'adr', nome: 'ADR', formato: inteiro },
    aim: { coluna: 'precisao', nome: 'Aim (accuracy)', formato: ou(percentagem) },
    hs: { coluna: 'hs', nome: 'Headshot %', formato: ou(percentagem) },
    flashes: { coluna: 'cegos', nome: 'Enemies flashed' },
    flashpct: { coluna: 'flashPct', nome: 'Flash %', formato: ou(percentagem) },
    teamflash: { coluna: 'teamflashes', nome: 'Team flashes' },
    hedmg: { coluna: 'heDano', nome: 'HE damage', formato: inteiro },
    ace: { coluna: 'k5', nome: 'ACEs' },
    k3: { coluna: 'k3', nome: '3Ks' },
    tradepct: { coluna: 'tradePct', nome: 'Trade %', formato: ou(percentagem) },
    matches: { coluna: 'partidas', nome: 'Matches' },
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
        .setName('remove')
        .setDescription('Take a player off the table (yourself, or anyone with Manage Server)')
        .addUserOption((o) => o.setName('user').setDescription('Who to remove (defaults to you)'))
        .addStringOption((o) => o.setName('steam64').setDescription('Or the Steam64 ID / profile link to remove').setMaxLength(100)),
    new SlashCommandBuilder()
        .setName('table')
        .setDescription("Open this server's stats table"),
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription("This month's stats of a player")
        .addUserOption((o) => o.setName('user').setDescription('Whose stats (defaults to you)')),
    new SlashCommandBuilder()
        .setName('top')
        .setDescription('Top 10 of this server by category (points are in /mvp)')
        .addStringOption((o) => o.setName('category').setDescription('What to rank by').setRequired(true)
            .addChoices(...Object.entries(CATEGORIAS).map(([value, { nome }]) => ({ name: nome, value }))))
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
        `💥 HE ${Math.round(l.heDano ?? 0)}`,
        `${l.partidas} ${t.partidasN}`,
    ].join(' · ');
}

/** Up to 10 lines "1. <@id> — value" for a /top category. */
function linhasTop(linhas, categoria, mencao) {
    const { coluna, formato = String } = CATEGORIAS[categoria];
    return linhas.slice(0, 10).map((l, i) => `${i + 1}. ${mencao(l.steam64Id)} — ${formato(l[coluna])}`).join('\n');
}

/** /table: a link button to this server's table, only for whoever asked. */
function respostaTable({ publicUrl, guildId, t, servidor = '' }) {
    if (!publicUrl) return { content: t.cmd.semSite, flags: MessageFlags.Ephemeral };
    const botao = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t.cmd.abrirTabela).setURL(`${publicUrl}/s/${guildId}`);
    return {
        content: preencher(t.cmd.table, { servidor }),
        components: [new ActionRowBuilder().addComponents(botao)],
        flags: MessageFlags.Ephemeral,
    };
}

const FORMATOS_PREMIO = { aim: percentagem, hs: percentagem };
const MAX_A_CAMINHO = 10;

/**
 * /mvp: the top 10 by points with the gap to 1st, who is still short of 5 matches, and who leads each award.
 * `linhas` are this month's table rows.
 */
function mensagemMvp({ linhas, idioma: codigo, mencao, periodo }) {
    const t = idioma(codigo);
    const vencedores = escolherVencedores(linhas);
    const partes = [preencher(t.cmd.mvp, { periodo })];

    if (vencedores.top.length) {
        const lider = vencedores.top[0].pontos;
        partes.push(...vencedores.top.map((l, i) => {
            const registo = `${l.vitorias}${t.resultado.V} ${l.empates}${t.resultado.E} ${l.derrotas}${t.resultado.D}`;
            const diferenca = i === 0 ? '' : ` (−${lider - l.pontos})`;
            const linha = `${i + 1}. ${mencao(l.steam64Id)} — ${l.pontos} pts${diferenca} · ${registo} · HLTV ${l.hltv.toFixed(2)}`;
            return i === 0 ? `🏆 ${linha}` : linha;
        }));
    } else {
        partes.push(preencher(t.cmd.mvpVazio, { minimo: MIN_PARTIDAS_MVP, periodo }));
    }

    const aCaminho = linhas.filter((l) => !l.elegivel).sort((a, b) => b.partidas - a.partidas || b.pontos - a.pontos);
    if (aCaminho.length) {
        const nomes = aCaminho.slice(0, MAX_A_CAMINHO).map((l) => preencher(t.cmd.mvpFaltam, {
            jogador: mencao(l.steam64Id), n: l.partidas, minimo: MIN_PARTIDAS_MVP, k: MIN_PARTIDAS_MVP - l.partidas,
        }));
        if (aCaminho.length > MAX_A_CAMINHO) nomes.push(`+${aCaminho.length - MAX_A_CAMINHO}`);
        partes.push('', preencher(t.cmd.mvpCaminho, { minimo: MIN_PARTIDAS_MVP }), nomes.join(', '));
    }

    const premios = Object.entries(vencedores.premios).filter(([, v]) => v);
    if (premios.length) {
        partes.push('', t.cmd.mvpPremios, premios.map(([p, v]) => `${EMOJIS[p]} ${mencao(v.steam64Id)} (${(FORMATOS_PREMIO[p] ?? String)(v.valor)})`).join(' · '));
    }
    return partes.join('\n');
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

/**
 * /remove: takes a player off the table, found by Discord user or by Steam64 ID.
 * Anyone can remove themselves; removing someone else needs Manage Server.
 * @returns {{ ok: true, discordId: string, steam64Id: string } | { ok: false, motivo: 'invalido' | 'sem_permissao' | 'nao_ligado' }}
 */
function removerPorComando({ db: bd, autorId, alvoId, texto, podeGerir }) {
    let jogador;
    if (texto) {
        const steam64Id = lerSteam64(texto);
        if (!steam64Id) return { ok: false, motivo: 'invalido' };
        jogador = bd.jogadorPorSteam(steam64Id);
    } else {
        jogador = bd.jogador(alvoId ?? autorId);
    }
    if (!jogador) return { ok: false, motivo: 'nao_ligado' };
    if (jogador.discord_id !== autorId && !podeGerir) return { ok: false, motivo: 'sem_permissao' };
    bd.desligarJogador(jogador.discord_id);
    console.log(`🗑️ ${jogador.discord_id} (Steam ${jogador.steam64_id}) removed with /remove (by ${autorId})`);
    return { ok: true, discordId: jogador.discord_id, steam64Id: jogador.steam64_id };
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

// Every linked player is in the tables (the stats are public; admins remove players with /remove)
function linhasDoServidor(periodo) {
    const jogadores = db.jogadoresLigados();
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
        const categoria = interaction.options.getString('category') ?? 'kills';
        const periodo = PERIODOS[interaction.options.getString('period') ?? 'month'];
        const nome = nomePeriodo(periodo, codigo);
        const { linhas, mencao } = linhasDoServidor(periodo);
        const content = linhas.length
            ? `${preencher(t.cmd.top, { categoria: t.cmd.categorias[categoria], periodo: nome })}\n`
                + linhasTop(ordenarPor(linhas, CATEGORIAS[categoria].coluna), categoria, mencao)
            : preencher(t.cmd.topVazio, { periodo: nome });
        await interaction.editReply({ content, allowedMentions: SEM_PINGS });
    },

    async mvp(interaction, t, codigo) {
        await interaction.deferReply();
        const { linhas, mencao } = linhasDoServidor('mes');
        const content = mensagemMvp({ linhas, idioma: codigo, mencao, periodo: nomePeriodo('mes', codigo) });
        await interaction.editReply({ content, allowedMentions: SEM_PINGS });
    },

    async remove(interaction, t) {
        const r = removerPorComando({
            db,
            autorId: interaction.user.id,
            alvoId: interaction.options.getUser('user')?.id ?? null,
            texto: interaction.options.getString('steam64'),
            podeGerir: Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)),
        });
        const content = r.ok
            ? preencher(t.cmd.remove.ok, { jogador: `<@${r.discordId}>`, steam: r.steam64Id })
            : t.cmd.remove[r.motivo];
        await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: SEM_PINGS });
    },

    async table(interaction, t) {
        const { publicUrl } = settings.obter();
        await interaction.reply(respostaTable({ publicUrl, guildId: interaction.guildId, t, servidor: interaction.guild?.name ?? '' }));
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
    CATEGORIAS, PERMISSOES_CONVITE, definicoes, linhaStats, linhasTop, lerSteam64, ligarPorComando, removerPorComando, respostaAdd, respostaTable, mensagemMvp, urlConvite, registarComandos, definirBD, tratarInteracao,
};
