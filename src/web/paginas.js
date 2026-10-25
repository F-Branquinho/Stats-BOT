// Landing page, server tables, player profiles and server settings
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { IDIOMAS } = require('../i18n');
const { definicoes } = require('../commands');
const { tabela, ordenarPor, porMes } = require('../leaderboard');
const { membrosLigados } = require('../membros');
const views = require('./views');
const { COLUNAS_VALIDAS, paginaTabela, paginaPerfil } = require('./views-tabela');

const TIPOS_TEXTO = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const PERIODOS = new Set(['mes', 'mes_passado', 'sempre']);
const { ViewChannel, SendMessages, ManageGuild } = PermissionFlagsBits;
const ULTIMAS_PARTIDAS = 20;

function canaisDeTexto(guild) {
    return [...guild.channels.cache.values()]
        .filter((c) => TIPOS_TEXTO.includes(c.type))
        .sort((a, b) => (a.parent?.rawPosition ?? -1) - (b.parent?.rawPosition ?? -1) || a.rawPosition - b.rawPosition)
        .map((c) => ({ id: c.id, nome: c.name, categoria: c.parent?.name ?? null }));
}

/** What the bot is missing to post the report in the chosen channel. */
function permissoesEmFalta(guild, canalId) {
    const canal = guild.channels.cache.get(canalId);
    if (!canal) return [];
    const tem = canal.permissionsFor(guild.members.me);
    const faltam = [[ViewChannel, 'View Channel'], [SendMessages, 'Send Messages']].filter(([p]) => !tem?.has(p)).map(([, nome]) => nome);
    return faltam.length ? [`In #${canal.name} I'm missing: ${faltam.join(', ')}.`] : [];
}

function registar(app, { cliente, db, obterSessao, exigirSessao, exigirCsrf, campo }) {
    app.get('/', (req, res) => {
        res.send(views.paginaInicial({
            bot: cliente().user,
            sessao: obterSessao(req),
            comandos: definicoes.map((c) => ({ nome: c.name, descricao: c.description })),
        }));
    });

    app.get('/dashboard', exigirSessao, (req, res) => {
        const { sessao } = req;
        const bot = cliente().guilds.cache;
        // Servers with the bot, and servers the user could add it to
        const lista = sessao.guilds
            .filter((g) => bot.has(g.id) || g.gerivel)
            .map((g) => ({ ...g, temBot: bot.has(g.id) }));
        if (sessao.dono) {
            // The bot owner also sees every server the bot is in
            const ids = new Set(lista.map((g) => g.id));
            for (const guild of bot.values()) {
                if (!ids.has(guild.id)) lista.push({ id: guild.id, nome: guild.name, icon: guild.icon, temBot: true, gerivel: true, comoDono: true });
            }
        }
        lista.sort((a, b) => Number(b.temBot) - Number(a.temBot) || a.nome.localeCompare(b.nome));
        res.send(views.paginaServidores({ sessao, servidores: lista }));
    });

    /** The server, when the bot is in it and the user is a member (or owns the bot). */
    function servidorVisivel(req) {
        const guild = cliente().guilds.cache.get(req.params.id);
        if (!guild) return null;
        return req.sessao.dono || req.sessao.guilds.some((g) => g.id === guild.id) ? guild : null;
    }

    function semAcesso(res) {
        return res.status(404).send(views.paginaErro("This server doesn't exist, the bot isn't in it, or you're not a member.", { estado: 'Not found', link: '/dashboard' }));
    }

    /** Linked players who are members of the server, by Steam id. */
    async function jogadoresDoServidor(guild) {
        const jogadores = await membrosLigados(guild, db.jogadoresLigados());
        return new Map(jogadores.map((j) => [j.steam64_id, j]));
    }

    app.get('/s/:id', exigirSessao, async (req, res, next) => {
        try {
            const guild = servidorVisivel(req);
            if (!guild) return semAcesso(res);
            const periodo = PERIODOS.has(req.query.periodo) ? req.query.periodo : 'mes';
            const ordem = COLUNAS_VALIDAS.has(req.query.ordem) ? req.query.ordem : 'pontos';

            const jogadores = await jogadoresDoServidor(guild);
            const linhas = ordenarPor(tabela(db, [...jogadores.keys()], periodo), ordem).map((l) => {
                const j = jogadores.get(l.steam64Id);
                return { ...l, discordId: j.discord_id, nome: j.name ?? j.discord_id, avatar: j.avatar };
            });
            res.send(paginaTabela({ sessao: req.sessao, guild, linhas, periodo, ordem }));
        } catch (error) {
            next(error);
        }
    });

    app.get('/s/:id/p/:discordId', exigirSessao, async (req, res, next) => {
        try {
            const guild = servidorVisivel(req);
            if (!guild) return semAcesso(res);
            const j = db.jogador(req.params.discordId);
            const membro = j && (await membrosLigados(guild, [j])).length > 0;
            if (!membro) {
                return res.status(404).send(views.paginaErro("This player isn't linked or isn't in this server.", { estado: 'Not found', link: `/s/${guild.id}` }));
            }
            const partidas = db.partidasDe([j.steam64_id], null, null);
            res.send(paginaPerfil({
                sessao: req.sessao,
                guild,
                jogador: { nome: j.name ?? j.discord_id, avatar: j.avatar, discordId: j.discord_id, steam64Id: j.steam64_id },
                total: tabela(db, [j.steam64_id], 'sempre')[0] ?? null,
                meses: porMes(partidas),
                partidas: partidas.slice(0, ULTIMAS_PARTIDAS),
            }));
        } catch (error) {
            next(error);
        }
    });

    // ---- Server settings: Manage Server (checked on every request) or bot owner

    async function servidorGerivel(req) {
        const guild = cliente().guilds.cache.get(req.params.id);
        if (!guild) return null;
        if (req.sessao.dono) return guild;
        const membro = await guild.members.fetch(req.sessao.userId).catch(() => null);
        return membro?.permissions.has(ManageGuild) ? guild : null;
    }

    function negar(req, res) {
        const { id } = req.params;
        if (!cliente().guilds.cache.has(id) && req.sessao.guilds.some((g) => g.id === id && g.gerivel)) {
            return res.redirect(`/add?guild=${id}`);
        }
        return res.status(403).send(views.paginaErro("You don't have the Manage Server permission in this server.", { estado: 'No access', link: '/dashboard' }));
    }

    async function renderServidor(req, guild, { cfg, erros = [], guardado = false } = {}) {
        const atual = cfg ?? db.servidor(guild.id);
        return views.paginaServidor({
            sessao: req.sessao,
            guild,
            canais: canaisDeTexto(guild),
            idiomas: IDIOMAS,
            cfg: atual,
            erros,
            avisos: permissoesEmFalta(guild, atual.reportChannelId),
            guardado,
            jogadores: (await jogadoresDoServidor(guild)).size,
        });
    }

    app.get('/server/:id', exigirSessao, async (req, res, next) => {
        try {
            const guild = await servidorGerivel(req);
            if (!guild) return negar(req, res);
            res.send(await renderServidor(req, guild, { guardado: req.query.saved === '1' }));
        } catch (error) {
            next(error);
        }
    });

    app.post('/server/:id', exigirSessao, exigirCsrf, async (req, res, next) => {
        try {
            const guild = await servidorGerivel(req);
            if (!guild) return negar(req, res);

            const cfg = {
                reportChannelId: campo(req, 'reportChannelId') || null,
                language: campo(req, 'language'),
                reportEnabled: req.body.reportEnabled === 'on',
            };
            const erros = [];
            if (cfg.reportChannelId && !canaisDeTexto(guild).some((c) => c.id === cfg.reportChannelId)) erros.push('Choose a text channel for the report.');
            if (cfg.reportEnabled && !cfg.reportChannelId) erros.push('Choose the report channel, or turn the monthly report off.');
            if (!IDIOMAS[cfg.language]) erros.push('Choose a language.');
            if (erros.length) return res.status(400).send(await renderServidor(req, guild, { cfg, erros }));

            db.guardarServidor(guild.id, cfg);
            console.log(`⚙ [${guild.name}] Settings saved by ${req.sessao.nome} (${req.sessao.userId})`);
            res.redirect(`/server/${guild.id}?saved=1`);
        } catch (error) {
            next(error);
        }
    });
}

module.exports = { registar };
