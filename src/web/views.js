// Website pages, as plain server-rendered HTML (no JavaScript in the browser)

function esc(valor) {
    return String(valor ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function avatarUtilizador(id, avatar) {
    return avatar
        ? `https://cdn.discordapp.com/avatars/${esc(id)}/${esc(avatar)}.png?size=64`
        : 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function iconeServidor(id, nome, icon) {
    if (icon) return `<img class="icone" src="https://cdn.discordapp.com/icons/${esc(id)}/${esc(icon)}.png?size=64" alt="">`;
    const iniciais = nome.split(/\s+/).map((p) => p[0]).join('').slice(0, 3);
    return `<span class="icone icone-texto">${esc(iniciais)}</span>`;
}

const CSS = `
:root {
  --fundo: #f2f3f5; --cartao: #ffffff; --texto: #1e1f22; --suave: #5c5e66; --borda: #dcdde1;
  --marca: #e8590c; --marca-texto: #ffffff; --ok: #1f8b4c; --aviso: #b26b00; --erro: #c62828;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fundo: #1e1f22; --cartao: #2b2d31; --texto: #f2f3f5; --suave: #a7a9b0; --borda: #3f4147;
    --marca: #ff922b; --marca-texto: #1e1f22; --ok: #57d68d; --aviso: #f0b232; --erro: #ff6b6b;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--fundo); color: var(--texto); overflow-wrap: break-word; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
main.larga { max-width: 1180px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
header .quem { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
h1 { font-size: 1.6rem; margin: 0 0 8px; }
h2 { font-size: 1.15rem; margin: 0 0 12px; }
a { color: var(--marca); }
.cartao { background: var(--cartao); border: 1px solid var(--borda); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.suave { color: var(--suave); }
.botao { display: inline-block; background: var(--marca); color: var(--marca-texto); border: 0; border-radius: 8px;
  padding: 10px 18px; font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
.botao.secundario { background: transparent; color: var(--texto); border: 1px solid var(--borda); }
.avatar { width: 36px; height: 36px; border-radius: 50%; }
.avatar.mini { width: 24px; height: 24px; vertical-align: middle; margin-right: 6px; }
.icone { width: 48px; height: 48px; border-radius: 14px; flex-shrink: 0; }
.icone-texto { display: inline-flex; align-items: center; justify-content: center; background: var(--borda); font-weight: 700; font-size: .9rem; }
.servidor { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.servidor .nome { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.etiqueta { font-size: .8rem; font-weight: 600; }
.etiqueta.ok { color: var(--ok); } .etiqueta.aviso { color: var(--aviso); } .etiqueta.erro { color: var(--erro); }
label { display: block; font-weight: 600; margin: 16px 0 6px; }
label.caixa { display: flex; align-items: center; gap: 8px; font-weight: 400; }
select, input[type=text], input[type=password], input[type=number] { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--borda);
  background: var(--fundo); color: var(--texto); font: inherit; }
.ajuda { font-size: .85rem; color: var(--suave); margin-top: 4px; }
.alerta { border-radius: 8px; padding: 12px 14px; margin-bottom: 16px; border: 1px solid; }
.alerta.ok { border-color: var(--ok); color: var(--ok); }
.alerta.aviso { border-color: var(--aviso); color: var(--aviso); }
.alerta.erro { border-color: var(--erro); color: var(--erro); }
.alerta ul { margin: 0; padding-left: 20px; }
.lista { margin: 0; padding-left: 20px; }
.centro { text-align: center; padding: 48px 20px; }
footer { max-width: 1180px; margin: 0 auto; padding: 24px 16px 40px; text-align: center; font-size: .9rem; color: var(--suave); }
footer a { color: var(--suave); }
.topo { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0 32px; }
.marca-bot { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 1.1rem; color: var(--texto); text-decoration: none; }
.hero { padding: 24px 0 40px; max-width: 720px; }
.hero h1 { font-size: clamp(2rem, 5vw, 3rem); line-height: 1.1; margin: 12px 0 16px; letter-spacing: -.02em; }
.hero p.lead { font-size: 1.15rem; color: var(--suave); margin: 0 0 24px; }
.selo { display: inline-block; padding: 4px 12px; border-radius: 999px; background: color-mix(in srgb, var(--marca) 15%, transparent); color: var(--marca); font-weight: 600; font-size: .9rem; }
.acoes { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.botao.grande { padding: 14px 24px; font-size: 1.05rem; border-radius: 10px; }
.secao { padding: 32px 0; }
.secao > h2 { font-size: 1.5rem; margin: 0 0 16px; }
.cartoes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.cartoes .cartao { margin: 0; }
.cartoes.duas { grid-template-columns: repeat(2, 1fr); }
.cartoes > * { min-width: 0; }
.cartoes h3 { margin: 8px 0 6px; font-size: 1.05rem; }
.cartoes p { margin: 0; color: var(--suave); }
.emoji { font-size: 1.8rem; }
.comando code { font-weight: 700; color: var(--marca); }
.texto-legal { max-width: 760px; margin: 0 auto; }
.texto-legal h2 { margin-top: 28px; }
.periodos { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.periodos a { padding: 6px 14px; border-radius: 999px; border: 1px solid var(--borda); text-decoration: none; color: var(--texto); }
.periodos a.ativo { background: var(--marca); border-color: var(--marca); color: var(--marca-texto); font-weight: 600; }
.tabela-wrap { overflow-x: auto; background: var(--cartao); border: 1px solid var(--borda); border-radius: 12px; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { padding: 10px 12px; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--borda); }
th:first-child, td:first-child, th:nth-child(2), td:nth-child(2) { text-align: left; }
tr:last-child td { border-bottom: 0; }
th a { color: var(--suave); text-decoration: none; font-size: .85rem; }
th a.ativo { color: var(--marca); font-weight: 700; }
td.jogador a { color: var(--texto); text-decoration: none; font-weight: 600; }
tr.inelegivel td { opacity: .55; }
.nota { font-size: .75rem; color: var(--suave); display: block; font-weight: 400; }
.res-V { color: var(--ok); font-weight: 700; } .res-D { color: var(--erro); font-weight: 700; } .res-E { color: var(--aviso); font-weight: 700; }
@media (max-width: 860px) { .cartoes, .cartoes.duas { grid-template-columns: 1fr; } }
`;

const REPOSITORIO = 'https://github.com/F-Branquinho/Stats-BOT';

function layout(titulo, corpo, { larga = false, descricao } = {}) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
${descricao ? `<meta name="description" content="${esc(descricao)}">` : ''}
<style>${CSS}</style>
</head>
<body>
<main${larga ? ' class="larga"' : ''}>${corpo}</main>
<footer><a href="/">Home</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · Data from <a href="https://leetify.com" target="_blank" rel="noopener">Leetify</a> · <a href="${REPOSITORIO}" target="_blank" rel="noopener">Source code</a></footer>
</body>
</html>`;
}

function cabecalho(sessao) {
    return `<header>
  <div class="quem">
    <img class="avatar" src="${avatarUtilizador(sessao.userId, sessao.avatar)}" alt="">
    <span>${esc(sessao.nome)}</span>
  </div>
  <div class="quem">
    <a class="botao secundario" href="/dashboard">Servers</a>
    <a class="botao secundario" href="/link">Steam account</a>
    ${sessao.dono ? '<a class="botao secundario" href="/settings">Bot settings</a>' : ''}
    <form method="post" action="/logout">
      <input type="hidden" name="csrf" value="${esc(sessao.csrf)}">
      <button class="botao secundario" type="submit">Log out</button>
    </form>
  </div>
</header>`;
}

function alertas(tipo, mensagens) {
    if (!mensagens?.length) return '';
    return `<div class="alerta ${tipo}"><ul>${mensagens.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>`;
}

const AJUDA_LEETIFY = 'Create an account on <a href="https://leetify.com" target="_blank" rel="noopener">leetify.com</a> with the same Steam account, '
    + 'and make the profile public (Leetify → Settings → Privacy).';

function paginaLink({ sessao, jogador, partidas, erros = [], ligado = false }) {
    let estado;
    if (!jogador) {
        estado = `<p>Your Discord account isn't linked to a Steam account yet.</p>
  <p class="suave">Steam only tells this site your Steam ID, never your password or e-mail.</p>
  <p><a class="botao" href="/link/steam">Sign in through Steam</a></p>`;
    } else {
        const perfil = `https://steamcommunity.com/profiles/${esc(jogador.steam64_id)}`;
        const leetify = jogador.leetify_status === 'ok'
            ? `<p><span class="etiqueta ok">● Leetify profile found</span> · ${partidas} counted matches so far</p>`
            : `<p><span class="etiqueta erro">● Leetify profile not found or private</span></p><p class="ajuda">${AJUDA_LEETIFY} The bot tries again once a day.</p>`;
        estado = `<p>Linked to Steam account <a href="${perfil}" target="_blank" rel="noopener"><code>${esc(jogador.steam64_id)}</code></a>.</p>
  ${leetify}
  <div class="acoes">
    <a class="botao secundario" href="/link/steam">Link a different Steam account</a>
    <form method="post" action="/link/remove">
      <input type="hidden" name="csrf" value="${esc(sessao.csrf)}">
      <button class="botao secundario" type="submit">Unlink</button>
    </form>
  </div>`;
    }
    return layout('Steam account', `
${cabecalho(sessao)}
<h1>Steam account</h1>
${ligado ? alertas('ok', ['Steam account linked. Your matches show up in the tables of every server you share with the bot.']) : ''}
${alertas('erro', erros)}
<div class="cartao">
  ${estado}
</div>
<div class="cartao">
  <h2>What you need</h2>
  <p class="suave">Matches come from Leetify (Premier, Competitive and FACEIT). ${AJUDA_LEETIFY}</p>
</div>`);
}

function paginaSetup({ campos, publicUrl, recuperacao, botLigado, erros }) {
    const introducao = recuperacao
        ? '<p>The saved bot token stopped working. Paste a new one to get the bot back online.</p>'
        : '<p>Connect the bot to your Discord application. Everything is checked with Discord before it is saved.</p>';
    return layout('Bot setup', `
<h1>Bot setup</h1>
${introducao}
${botLigado ? alertas('ok', ['The bot is already connected (token from .env). Finish the website setup below.']) : ''}
${alertas('erro', erros)}
<form class="cartao" method="post" action="/setup" autocomplete="off">
  <label for="code">Setup code</label>
  <input id="code" name="code" type="text" required placeholder="ABCD-EFGH" spellcheck="false">
  <div class="ajuda">Shown by the installer and in the bot's logs: <code>journalctl -u stats-bot</code>. It keeps strangers from setting up your bot first.</div>
${campos.botToken ? `
  <label for="botToken">Bot token</label>
  <input id="botToken" name="botToken" type="password" required spellcheck="false">
  <div class="ajuda"><a href="https://discord.com/developers/applications" target="_blank" rel="noopener">Developer Portal</a> → your application → <strong>Bot</strong> → <strong>Reset Token</strong>.</div>` : ''}
${campos.clientSecret ? `
  <label for="clientSecret">OAuth2 client secret</label>
  <input id="clientSecret" name="clientSecret" type="password" required spellcheck="false">
  <div class="ajuda">Developer Portal → your application → <strong>OAuth2</strong> → <strong>Client Secret</strong>. Used for "Log in with Discord".</div>` : ''}
${campos.publicUrl ? `
  <label for="publicUrl">Public address of this website</label>
  <input id="publicUrl" name="publicUrl" type="text" required placeholder="https://stats.example.com" value="${esc(publicUrl)}" spellcheck="false">
  <div class="ajuda">The address your Cloudflare Tunnel points at this bot, without a trailing <code>/</code>.</div>` : ''}
${campos.leetifyKey ? `
  <label for="leetifyKey">Leetify API key (optional)</label>
  <input id="leetifyKey" name="leetifyKey" type="password" spellcheck="false">
  <div class="ajuda">Raises Leetify's rate limits. Get one for free at <a href="https://leetify.com/app/developer" target="_blank" rel="noopener">leetify.com/app/developer</a>. You can add it later in Bot settings.</div>` : ''}

  <p style="margin-top:20px"><button class="botao" type="submit">Connect</button></p>
</form>`);
}

function paginaSetupConcluido({ nome, publicUrl, redirect, convite }) {
    return layout('Setup complete', `
<h1>✅ ${esc(nome)} is online</h1>
<div class="cartao">
  <h2>Last steps</h2>
  <ol class="lista">
    <li>In Developer Portal → <strong>OAuth2</strong> → <strong>Redirects</strong>, add:<br><code>${esc(redirect)}</code></li>
    <li>Add the bot to your server: <a href="${esc(convite)}" target="_blank" rel="noopener">invite link</a>.</li>
    <li>Open <a href="${esc(publicUrl)}">${esc(publicUrl)}</a>, log in with Discord, link your Steam account and pick the report channel of each server.</li>
  </ol>
</div>`);
}

function paginaDefinicoes({ sessao, origens, publicUrl, orcamento, botNome, erros, guardado }) {
    const doEnv = '<div class="ajuda">Set in <code>.env</code>, so it can only be changed there.</div>';
    return layout('Bot settings', `
${cabecalho(sessao)}
<h1>Bot settings</h1>
<p class="suave">Connected as ${esc(botNome)}. Only the owner of the Discord application sees this page.</p>
${guardado ? alertas('ok', ['Settings saved.']) : ''}
${alertas('erro', erros)}
<form class="cartao" method="post" action="/settings" autocomplete="off">
  <input type="hidden" name="csrf" value="${esc(sessao.csrf)}">

  <label for="botToken">New bot token</label>
  ${origens.botToken === 'env' ? doEnv : `<input id="botToken" name="botToken" type="password" placeholder="Leave empty to keep the current one" spellcheck="false">
  <div class="ajuda">The bot reconnects with the new token; if it doesn't work, the current one stays.</div>`}

  <label for="clientSecret">New OAuth2 client secret</label>
  ${origens.clientSecret === 'env' ? doEnv : '<input id="clientSecret" name="clientSecret" type="password" placeholder="Leave empty to keep the current one" spellcheck="false">'}

  <label for="publicUrl">Public address of this website</label>
  ${origens.publicUrl === 'env' ? `<p><code>${esc(publicUrl)}</code></p>${doEnv}` : `<input id="publicUrl" name="publicUrl" type="text" required value="${esc(publicUrl)}" spellcheck="false">
  <div class="ajuda">If you change it, also update the redirect in Developer Portal → OAuth2 → Redirects (<code>&lt;address&gt;/callback</code>).</div>`}

  <label for="leetifyKey">Leetify API key</label>
  ${origens.leetifyKey === 'env' ? doEnv : `<input id="leetifyKey" name="leetifyKey" type="password" placeholder="${origens.leetifyKey ? 'Leave empty to keep the current one' : 'Optional'}" spellcheck="false">
  ${origens.leetifyKey ? '<label class="caixa"><input type="checkbox" name="removeLeetifyKey"> Remove the saved key</label>' : ''}
  <div class="ajuda">Free at <a href="https://leetify.com/app/developer" target="_blank" rel="noopener">leetify.com/app/developer</a>; raises the rate limits.</div>`}

  <label for="dailyBudget">Leetify requests per day</label>
  ${origens.orcamentoDiario === 'env' ? `<p><code>${esc(orcamento)}</code></p>${doEnv}` : `<input id="dailyBudget" name="dailyBudget" type="number" min="1" step="1" required value="${esc(orcamento)}">
  <div class="ajuda">When reached, collections stop until midnight. Each collection makes one request per linked player.</div>`}

  <p style="margin-top:20px"><button class="botao" type="submit">Save</button></p>
</form>`);
}

function paginaPrivacidade({ botNome }) {
    const nome = esc(botNome);
    return layout('Privacy policy', `
<div class="texto-legal">
<p><a href="/">← Home</a></p>
<h1>Privacy policy</h1>
<p class="suave">${nome} is a Discord bot that shows CS2 stats leaderboards for a Discord server, using data from Leetify. This page explains what it stores and why.</p>

<h2>What the bot stores</h2>
<ul>
  <li><strong>Your link</strong>: your Discord user ID, display name and avatar, and the Steam ID you linked with "Sign in through Steam".</li>
  <li><strong>Your matches</strong>: for each Premier, Competitive or FACEIT match that Leetify has for your Steam ID, the date, map, result and your stats (kills, deaths, rounds, flashes, accuracy and similar), plus your current Leetify ratings.</li>
  <li><strong>Server settings</strong> chosen in the dashboard: the server ID, the report channel, the report language and whether the report is on.</li>
</ul>

<h2>Who sees it</h2>
<p>Your stats are shown in the tables, commands and monthly reports of the Discord servers you share with the bot, to members of those servers.</p>

<h2>What the bot reads but does not store</h2>
<ul>
  <li>When you <strong>log in</strong>, Discord shares your user ID, username, avatar and the list of your servers. This is kept in memory only while you're logged in (at most 7 days, or until the bot restarts).</li>
  <li>Steam only tells the bot your Steam ID. The bot never sees your Steam password or e-mail.</li>
</ul>

<h2>Cookies</h2>
<p>The website uses one cookie to keep you logged in, and short-lived ones during login to protect it. There are no analytics, ads or tracking.</p>

<h2>Sharing</h2>
<p>Nothing is sold or shared. The bot only talks to Discord, Steam (to confirm your Steam ID) and Leetify (to fetch your matches).</p>

<h2>Deleting your data</h2>
<ul>
  <li>Click <strong>Unlink</strong> on the Steam account page and the bot stops showing and fetching your stats.</li>
  <li>To have your stored matches deleted too, open an issue on the <a href="${REPOSITORIO}/issues" target="_blank" rel="noopener">project's GitHub</a>.</li>
</ul>
</div>`, { descricao: `What ${botNome} stores and why.` });
}

function paginaTermos({ botNome }) {
    const nome = esc(botNome);
    return layout('Terms of service', `
<div class="texto-legal">
<p><a href="/">← Home</a></p>
<h1>Terms of service</h1>
<p>By adding ${nome} to a server, linking your Steam account or using its website, you agree to these terms.</p>
<ul>
  <li>${nome} is free and provided as is, without guarantees that it will always be online or that the stats are complete or correct. Stats come from Leetify and depend on it.</li>
  <li>Only link your own Steam account.</li>
  <li>Don't use the bot to spam, harass anyone, or break <a href="https://discord.com/terms" target="_blank" rel="noopener">Discord's Terms of Service</a>.</li>
  <li>The bot may be removed from servers that abuse it, and these terms may change; the current version is always on this page.</li>
</ul>
<p>See the <a href="/privacy">privacy policy</a> for what the bot stores. The source code is on <a href="${REPOSITORIO}" target="_blank" rel="noopener">GitHub</a>.</p>
</div>`, { descricao: `Terms of service for ${botNome}.` });
}

function paginaErro(mensagem, { estado = 'Error', link = '/' } = {}) {
    return layout(estado, `
<div class="cartao centro">
  <h1>${esc(estado)}</h1>
  <p>${esc(mensagem)}</p>
  <p><a class="botao" href="${esc(link)}">Back</a></p>
</div>`);
}

module.exports = {
    esc,
    avatarUtilizador,
    iconeServidor,
    layout,
    cabecalho,
    alertas,
    paginaLink,
    paginaSetup,
    paginaSetupConcluido,
    paginaDefinicoes,
    paginaPrivacidade,
    paginaTermos,
    paginaErro,
};
