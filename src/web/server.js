const crypto = require('crypto');
const express = require('express');
const { PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const settings = require('../settings');
const { urlConvite, PERMISSOES_CONVITE } = require('../commands');
const { agoraLisboa } = require('../periodos');
const steam = require('./steam');
const { chaveValida: chaveFaceitValida } = require('../faceit');
const views = require('./views');
const paginas = require('./paginas');

const API = 'https://discord.com/api/v10';
const COOKIE_SESSAO = 'sessao';
const COOKIE_ESTADO = 'oauth_state';
const COOKIE_DEPOIS = 'depois';
const COOKIE_STEAM = 'steam_state';
const SESSAO_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const RECOLHA_AO_LIGAR_MS = 10 * 1000;
const { ManageGuild, Administrator } = PermissionFlagsBits;
// Wrong setup codes allowed per window, so the code can't be guessed
const MAX_FALHAS_SETUP = 10;
const JANELA_FALHAS_MS = 15 * 60 * 1000;

// Sessions live in memory: a bot restart just means logging in again
const sessoes = new Map();
const falhasSetup = [];

function lerCookies(req) {
    const cookies = {};
    for (const parte of (req.headers.cookie ?? '').split(';')) {
        const i = parte.indexOf('=');
        if (i <= 0) continue;
        // Other sites on the same parent domain can set cookies we can't decode: skip those
        try {
            cookies[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
        } catch {
            // ignore
        }
    }
    return cookies;
}

/** Security headers for every response; HSTS only when the site is served over HTTPS. */
function cabecalhosSeguranca(publicUrl) {
    const cabecalhos = {
        'Content-Security-Policy': "default-src 'none'; img-src https://cdn.discordapp.com; style-src 'unsafe-inline'; form-action 'self' https://steamcommunity.com; frame-ancestors 'none'",
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
    };
    if (publicUrl?.startsWith('https://')) cabecalhos['Strict-Transport-Security'] = 'max-age=31536000';
    return cabecalhos;
}

function definirCookie(res, nome, valor, maxAgeMs) {
    const partes = [`${nome}=${encodeURIComponent(valor)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
    if (settings.obter().publicUrl?.startsWith('https://')) partes.push('Secure');
    res.append('Set-Cookie', partes.join('; '));
}

function iguais(a, b) {
    return typeof a === 'string' && typeof b === 'string' && a.length === b.length
        && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function obterSessao(req) {
    const id = lerCookies(req)[COOKIE_SESSAO];
    const sessao = id ? sessoes.get(id) : null;
    if (!sessao) return null;
    if (sessao.expira < Date.now()) {
        sessoes.delete(id);
        return null;
    }
    return sessao;
}

/** Only local paths, so the login can't be used to send people to another site. */
function caminhoLocal(valor) {
    return typeof valor === 'string' && /^\/(?![/\\])/.test(valor) ? valor : null;
}

function exigirSessao(req, res, next) {
    req.sessao = obterSessao(req);
    if (!req.sessao) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    next();
}

function exigirCsrf(req, res, next) {
    if (!iguais(req.body?.csrf, req.sessao?.csrf)) {
        return res.status(403).send(views.paginaErro('This form has expired. Reload the page and try again.'));
    }
    next();
}

function exigirDono(req, res, next) {
    if (!req.sessao.dono) {
        return res.status(403).send(views.paginaErro('Only the owner of the bot application can change its settings.', { estado: 'No access' }));
    }
    next();
}

function campo(req, nome) {
    return typeof req.body?.[nome] === 'string' ? req.body[nome].trim() : '';
}

async function apiDiscord(caminho, accessToken) {
    const resposta = await fetch(`${API}${caminho}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resposta.ok) throw new Error(`Discord API ${caminho} returned ${resposta.status}`);
    return resposta.json();
}

/** The application a bot token belongs to, or null if the token is invalid. */
async function aplicacaoDoToken(token) {
    const resposta = await fetch(`${API}/oauth2/applications/@me`, { headers: { Authorization: `Bot ${token}` } });
    if (resposta.status === 401) return null;
    if (!resposta.ok) throw new Error(`Discord API returned ${resposta.status}`);
    return resposta.json();
}

/** Checks the OAuth2 client secret by asking Discord for a client-credentials token. */
async function segredoValido(applicationId, segredo) {
    const resposta = await fetch(`${API}/oauth2/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${applicationId}:${segredo}`).toString('base64')}`,
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'identify' }),
    });
    return resposta.ok;
}

/** Address the visitor used through the tunnel, to prefill the public address on the setup page. */
function urlDoPedido(req) {
    const proto = req.headers['x-forwarded-proto'];
    return proto === 'https' && req.headers.host ? `https://${req.headers.host}` : '';
}

/**
 * @param {typeof import('../bot')} bot
 * @param {{ db: ReturnType<import('../db').abrirBD>, recolha: ReturnType<import('../collector').criarRecolha> }} deps
 * @returns {import('http').Server}
 */
function iniciarPainel(bot, { db, recolha }) {
    const app = express();
    const cliente = () => bot.estado.cliente;
    const redirectUri = () => `${settings.obter().publicUrl}/callback`;

    app.disable('x-powered-by');
    app.use((req, res, next) => {
        res.set(cabecalhosSeguranca(settings.obter().publicUrl));
        next();
    });
    app.use(express.urlencoded({ extended: false, limit: '20kb' }));

    app.get('/health', (req, res) => {
        const ligado = Boolean(cliente()?.isReady());
        let texto = 'starting';
        if (ligado) texto = 'ok';
        else if (bot.estado.erroLogin) texto = 'login failed';
        else if (!settings.obter().botToken) texto = 'setup needed';
        const r = recolha.estado();
        const linhas = [
            texto,
            `last collection: ${r.ultimaRecolha ?? 'none yet'}`,
            `leetify requests today: ${db.pedidosHoje(agoraLisboa().data)}/${settings.obter().orcamentoDiario}${r.orcamentoEsgotado ? ' (budget reached)' : ''}`,
        ];
        if (r.emPausaAte) linhas.push(`rate limited until: ${r.emPausaAte}`);
        linhas.push(`faceit: ${settings.obter().faceitKey ? 'on' : 'off'}`);
        res.status(ligado ? 200 : 503).type('text').send(linhas.join('\n'));
    });

    // Legal pages are always reachable, also before the setup and while the bot is offline
    const nomeBot = () => cliente()?.user?.username ?? 'Stats BOT';
    app.get('/privacy', (req, res) => res.send(views.paginaPrivacidade({ botNome: nomeBot() })));
    app.get('/terms', (req, res) => res.send(views.paginaTermos({ botNome: nomeBot() })));

    // ---- Setup: open until the token, client secret and public address are all set

    /** Only asks for what is missing (plus the token when the saved one stopped working). */
    function campos() {
        const atuais = settings.obter();
        return {
            botToken: !atuais.botToken || bot.estado.recuperacao,
            clientSecret: !atuais.clientSecret,
            publicUrl: !atuais.publicUrl,
            leetifyKey: !atuais.leetifyKey,
            faceitKey: !atuais.faceitKey,
        };
    }

    function renderSetup(req, { erros = [], publicUrl } = {}) {
        return views.paginaSetup({
            campos: campos(),
            publicUrl: publicUrl ?? settings.obter().publicUrl ?? urlDoPedido(req),
            recuperacao: bot.estado.recuperacao,
            botLigado: Boolean(cliente()?.isReady()),
            erros,
        });
    }

    app.get('/setup', (req, res) => {
        if (!bot.emSetup()) return res.redirect('/');
        res.send(renderSetup(req));
    });

    app.post('/setup', async (req, res, next) => {
        try {
            if (!bot.emSetup()) return res.redirect('/');

            const agora = Date.now();
            while (falhasSetup.length && falhasSetup[0] < agora - JANELA_FALHAS_MS) falhasSetup.shift();
            if (falhasSetup.length >= MAX_FALHAS_SETUP) {
                return res.status(429).send(views.paginaErro('Too many wrong setup codes. Wait 15 minutes and try again.', { estado: 'Slow down', link: '/setup' }));
            }

            const mostrar = campos();
            const atuais = settings.obter();
            const token = mostrar.botToken ? campo(req, 'botToken') : atuais.botToken;
            const segredo = mostrar.clientSecret ? campo(req, 'clientSecret') : atuais.clientSecret;
            const publicUrl = mostrar.publicUrl ? campo(req, 'publicUrl').replace(/\/+$/, '') : atuais.publicUrl;
            const leetifyKey = mostrar.leetifyKey ? campo(req, 'leetifyKey') : '';
            const faceitKey = mostrar.faceitKey ? campo(req, 'faceitKey') : '';
            const responder = (status, erros) => res.status(status).send(renderSetup(req, { erros, publicUrl }));

            if (!iguais(campo(req, 'code').toUpperCase(), settings.codigoSetup())) {
                falhasSetup.push(agora);
                return responder(403, ["Wrong setup code. It's in the bot's logs (journalctl -u stats-bot) and was shown by the installer."]);
            }

            const erros = [];
            if (!token) erros.push('Paste the bot token.');
            if (!segredo) erros.push('Paste the OAuth2 client secret.');
            if (!settings.urlValido(publicUrl)) erros.push('The public address must look like https://stats.example.com');
            if (erros.length) return responder(400, erros);
            if (faceitKey && !await chaveFaceitValida(faceitKey)) {
                return responder(400, ['The FACEIT API key is invalid. Copy a server-side key from developers.faceit.com, or leave it empty.']);
            }

            const aplicacao = await aplicacaoDoToken(token);
            if (!aplicacao) return responder(400, ['The bot token is invalid. Get a new one in Developer Portal → Bot → Reset Token.']);
            if (!await segredoValido(aplicacao.id, segredo)) {
                return responder(400, [`The client secret doesn't belong to ${aplicacao.name}. Copy it from Developer Portal → OAuth2 → Client Secret.`]);
            }

            if (cliente()?.token !== token || !cliente()?.isReady()) {
                try {
                    await bot.iniciarBot(token);
                } catch (error) {
                    return responder(400, [error.message]);
                }
            }

            settings.guardar({
                ...(mostrar.botToken && { botToken: token }),
                ...(mostrar.clientSecret && { clientSecret: segredo }),
                ...(mostrar.publicUrl && { publicUrl }),
                ...(leetifyKey && { leetifyKey }),
                ...(faceitKey && { faceitKey }),
            });
            settings.apagarCodigoSetup();
            if (faceitKey) recolherAgora('FACEIT key set on the setup page');
            bot.estado.recuperacao = false;
            console.log(`⚙ Setup complete for ${aplicacao.name}. Website: ${publicUrl}`);
            res.send(views.paginaSetupConcluido({
                nome: aplicacao.name,
                publicUrl,
                redirect: `${publicUrl}/callback`,
                convite: urlConvite(aplicacao.id),
            }));
        } catch (error) {
            next(error);
        }
    });

    // Everything else needs the setup done and the bot connected
    app.use((req, res, next) => (bot.emSetup() ? res.redirect('/setup') : next()));
    app.use((req, res, next) => {
        if (cliente()?.isReady()) return next();
        const mensagem = bot.estado.erroLogin
            ? `The bot can't connect to Discord: ${bot.estado.erroLogin}`
            : 'The bot is starting. Try again in a few seconds.';
        res.status(503).send(views.paginaErro(mensagem, { estado: 'Bot offline', link: req.originalUrl }));
    });

    // ---- Log in with Discord

    function autorizar(res, parametros) {
        const estado = crypto.randomBytes(16).toString('hex');
        definirCookie(res, COOKIE_ESTADO, estado, 10 * 60 * 1000);
        const url = new URL('https://discord.com/oauth2/authorize');
        url.search = new URLSearchParams({
            client_id: cliente().user.id,
            response_type: 'code',
            redirect_uri: redirectUri(),
            state: estado,
            ...parametros,
        }).toString();
        res.redirect(url.toString());
    }

    app.get('/login', (req, res) => {
        const depois = caminhoLocal(req.query.next);
        definirCookie(res, COOKIE_DEPOIS, depois ?? '', depois ? 10 * 60 * 1000 : 0);
        autorizar(res, { scope: 'identify guilds', prompt: 'none' });
    });

    // "Add to Discord": adds the bot and logs in at once, then Discord sends the person back to that server's page
    app.get('/add', (req, res) => {
        const parametros = {
            scope: 'bot applications.commands identify guilds',
            permissions: String(PERMISSOES_CONVITE),
        };
        const guild = typeof req.query.guild === 'string' && /^\d{17,20}$/.test(req.query.guild) ? req.query.guild : null;
        if (guild) Object.assign(parametros, { guild_id: guild, disable_guild_select: 'true' });
        autorizar(res, parametros);
    });

    app.get('/callback', async (req, res, next) => {
        try {
            const { code, state } = req.query;
            const cookies = lerCookies(req);
            definirCookie(res, COOKIE_ESTADO, '', 0);
            definirCookie(res, COOKIE_DEPOIS, '', 0);
            if (typeof code !== 'string' || !iguais(state, cookies[COOKIE_ESTADO])) {
                return res.status(400).send(views.paginaErro('The login was cancelled or expired. Please try again.', { link: '/login' }));
            }

            const resposta = await fetch(`${API}/oauth2/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: cliente().user.id,
                    client_secret: settings.obter().clientSecret,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri(),
                }),
            });
            if (!resposta.ok) throw new Error(`OAuth token exchange failed: ${resposta.status} ${await resposta.text()}`);
            const { access_token: accessToken } = await resposta.json();

            const [user, guilds] = await Promise.all([
                apiDiscord('/users/@me', accessToken),
                apiDiscord('/users/@me/guilds', accessToken),
            ]);

            // The owner of the application (or a member of its team) can change the bot settings
            let dono = false;
            try {
                const { owner } = await cliente().application.fetch();
                dono = owner?.members ? owner.members.has(user.id) : owner?.id === user.id;
            } catch (error) {
                console.warn('⚠ Could not check the application owner:', error.message);
            }

            const id = crypto.randomBytes(32).toString('hex');
            sessoes.set(id, {
                userId: user.id,
                nome: user.global_name ?? user.username,
                avatar: user.avatar,
                // Every server the user is in; `gerivel` when they have Manage Server there
                guilds: guilds.map((g) => ({
                    id: g.id,
                    nome: g.name,
                    icon: g.icon,
                    gerivel: g.owner || (BigInt(g.permissions) & (ManageGuild | Administrator)) !== 0n,
                })),
                dono,
                csrf: crypto.randomBytes(16).toString('hex'),
                expira: Date.now() + SESSAO_MAX_MS,
            });
            definirCookie(res, COOKIE_SESSAO, id, SESSAO_MAX_MS);
            console.log(`🔑 Website login: ${user.username} (${user.id})${dono ? ' [owner]' : ''}`);

            // Coming from "Add to Discord": wait for the bot to join, then open that server's page
            const adicionado = typeof req.query.guild_id === 'string' && /^\d{17,20}$/.test(req.query.guild_id) ? req.query.guild_id : null;
            if (adicionado) {
                for (let i = 0; i < 20 && !cliente().guilds.cache.has(adicionado); i++) {
                    await new Promise((r) => setTimeout(r, 250));
                }
                return res.redirect(`/server/${adicionado}`);
            }
            res.redirect(caminhoLocal(cookies[COOKIE_DEPOIS]) ?? '/dashboard');
        } catch (error) {
            next(error);
        }
    });

    app.post('/logout', exigirSessao, exigirCsrf, (req, res) => {
        sessoes.delete(lerCookies(req)[COOKIE_SESSAO]);
        definirCookie(res, COOKIE_SESSAO, '', 0);
        res.redirect('/');
    });

    // ---- Link a Steam account

    function renderLink(sessao, opcoes = {}) {
        const jogador = db.jogador(sessao.userId);
        const partidas = jogador ? db.partidasDe([jogador.steam64_id], null, null).length : 0;
        return views.paginaLink({ sessao, jogador, partidas, ...opcoes });
    }

    app.get('/link', exigirSessao, (req, res) => {
        res.send(renderLink(req.sessao, { ligado: req.query.linked === '1' }));
    });

    app.get('/link/steam', exigirSessao, (req, res) => {
        const estado = crypto.randomBytes(16).toString('hex');
        definirCookie(res, COOKIE_STEAM, estado, 10 * 60 * 1000);
        res.redirect(steam.urlLogin(settings.obter().publicUrl, estado));
    });

    app.get('/link/steam/callback', exigirSessao, async (req, res, next) => {
        try {
            const estadoGuardado = lerCookies(req)[COOKIE_STEAM];
            definirCookie(res, COOKIE_STEAM, '', 0);
            const falhou = (mensagem) => res.status(400).send(renderLink(req.sessao, { erros: [mensagem] }));
            if (!iguais(req.query.state, estadoGuardado)) return falhou('The Steam sign-in was cancelled or expired. Please try again.');

            const steam64Id = await steam.verificar(req.query, { publicUrl: settings.obter().publicUrl });
            if (!steam64Id) return falhou("Steam didn't confirm the sign-in. Please try again.");

            const { sessao } = req;
            const ligacao = db.ligarJogador({ discordId: sessao.userId, steam64Id, nome: sessao.nome, avatar: sessao.avatar });
            if (!ligacao.ok) return falhou('This Steam account is already linked to another Discord user.');
            console.log(`🔗 ${sessao.nome} (${sessao.userId}) linked Steam ${steam64Id}`);

            // Fetch the matches right away, but don't keep the person waiting for long
            const recolher = recolha.recolherJogador(steam64Id)
                .catch((error) => console.error(`❌ Could not fetch matches of ${steam64Id}:`, error.message));
            await Promise.race([recolher, new Promise((r) => setTimeout(r, RECOLHA_AO_LIGAR_MS).unref())]);
            res.redirect('/link?linked=1');
        } catch (error) {
            next(error);
        }
    });

    app.post('/link/remove', exigirSessao, exigirCsrf, (req, res) => {
        db.desligarJogador(req.sessao.userId);
        console.log(`🔗 ${req.sessao.nome} (${req.sessao.userId}) unlinked their Steam account`);
        res.redirect('/link');
    });

    function recolherAgora(motivo) {
        console.log(`🔄 Collection started (${motivo})`);
        recolha.recolherTudo().catch((error) => console.error('❌ Collection failed:', error));
    }

    // ---- Bot settings (owner only)

    function renderDefinicoes(sessao, { erros = [], guardado = false, recolhendo = false, publicUrl, orcamento } = {}) {
        const origens = Object.fromEntries(['botToken', 'clientSecret', 'publicUrl', 'leetifyKey', 'faceitKey', 'orcamentoDiario'].map((c) => [c, settings.origem(c)]));
        return views.paginaDefinicoes({
            sessao,
            origens,
            publicUrl: publicUrl ?? settings.obter().publicUrl,
            orcamento: orcamento ?? settings.obter().orcamentoDiario,
            botNome: cliente().user.tag,
            erros,
            guardado,
            recolhendo,
        });
    }

    app.get('/settings', exigirSessao, exigirDono, (req, res) => {
        res.send(renderDefinicoes(req.sessao, { guardado: req.query.saved === '1', recolhendo: req.query.collecting === '1' }));
    });

    app.post('/settings/collect', exigirSessao, exigirCsrf, exigirDono, (req, res) => {
        recolherAgora(`asked by ${req.sessao.nome}`);
        res.redirect('/settings?collecting=1');
    });

    app.post('/settings', exigirSessao, exigirCsrf, exigirDono, async (req, res, next) => {
        try {
            const novoToken = settings.origem('botToken') === 'env' ? '' : campo(req, 'botToken');
            const novoSegredo = settings.origem('clientSecret') === 'env' ? '' : campo(req, 'clientSecret');
            const publicUrl = settings.origem('publicUrl') === 'env' ? settings.obter().publicUrl : campo(req, 'publicUrl').replace(/\/+$/, '');
            const leetifyEnv = settings.origem('leetifyKey') === 'env';
            const novaChave = leetifyEnv ? '' : campo(req, 'leetifyKey');
            const removerChave = !leetifyEnv && req.body.removeLeetifyKey === 'on';
            const faceitEnv = settings.origem('faceitKey') === 'env';
            const novaFaceit = faceitEnv ? '' : campo(req, 'faceitKey');
            const removerFaceit = !faceitEnv && req.body.removeFaceitKey === 'on';
            const orcamentoEnv = settings.origem('orcamentoDiario') === 'env';
            const orcamento = orcamentoEnv ? settings.obter().orcamentoDiario : settings.orcamentoValido(campo(req, 'dailyBudget'));
            const responder = (erros) => res.status(400).send(renderDefinicoes(req.sessao, { erros, publicUrl, orcamento: campo(req, 'dailyBudget') }));

            if (!settings.urlValido(publicUrl)) return responder(['The public address must look like https://stats.example.com']);
            if (!orcamento) return responder(['Requests per day must be a whole number above 0.']);
            if (novaFaceit && !await chaveFaceitValida(novaFaceit)) {
                return responder(['The FACEIT API key is invalid. Copy a server-side key from developers.faceit.com.']);
            }

            let applicationId = cliente().application.id;
            if (novoToken) {
                const aplicacao = await aplicacaoDoToken(novoToken);
                if (!aplicacao) return responder(['The new bot token is invalid.']);
                if (aplicacao.id !== applicationId && !novoSegredo) {
                    return responder([`This token belongs to a different application (${aplicacao.name}). Paste its client secret too.`]);
                }
                applicationId = aplicacao.id;
            }
            if (novoSegredo && !await segredoValido(applicationId, novoSegredo)) {
                return responder(["The client secret doesn't match the bot's application."]);
            }
            if (novoToken) {
                try {
                    await bot.iniciarBot(novoToken);
                } catch (error) {
                    return responder([error.message]);
                }
            }

            settings.guardar({
                ...(novoToken && { botToken: novoToken }),
                ...(novoSegredo && { clientSecret: novoSegredo }),
                ...(settings.origem('publicUrl') !== 'env' && { publicUrl }),
                ...(novaChave && { leetifyKey: novaChave }),
                ...(removerChave && !novaChave && { leetifyKey: null }),
                ...(novaFaceit && { faceitKey: novaFaceit }),
                ...(removerFaceit && !novaFaceit && { faceitKey: null }),
                ...(!orcamentoEnv && { orcamentoDiario: orcamento }),
            });
            console.log(`⚙ Bot settings changed by ${req.sessao.nome} (${req.sessao.userId})`);
            // A new FACEIT key: fetch the FACEIT matches right away instead of waiting for the evening window
            if (novaFaceit) {
                recolherAgora('new FACEIT key');
                return res.redirect('/settings?saved=1&collecting=1');
            }
            res.redirect('/settings?saved=1');
        } catch (error) {
            next(error);
        }
    });

    // ---- Landing page, server tables, player profiles and server settings
    paginas.registar(app, { cliente, db, obterSessao, exigirSessao, exigirCsrf, campo });

    app.use((req, res) => {
        res.status(404).send(views.paginaErro("This page doesn't exist.", { estado: 'Not found' }));
    });

    // eslint-disable-next-line no-unused-vars
    app.use((error, req, res, next) => {
        console.error('❌ Website error:', error);
        res.status(500).send(views.paginaErro('Something went wrong. Please try again in a moment.'));
    });

    // Clear expired sessions every hour
    setInterval(() => {
        for (const [id, s] of sessoes) if (s.expira < Date.now()) sessoes.delete(id);
    }, 60 * 60 * 1000).unref();

    return app.listen(config.WEB_PORT, config.WEB_HOST, () => {
        console.log(`🌐 Website listening on http://${config.WEB_HOST}:${config.WEB_PORT}`);
    });
}

module.exports = { iniciarPainel, caminhoLocal, lerCookies, cabecalhosSeguranca };
