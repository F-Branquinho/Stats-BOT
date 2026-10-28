// Texts the bot posts in a server (monthly report and command replies), in each supported language.
// Texts use {placeholders}, filled in by preencher().

const IDIOMAS = {
    pt: {
        nome: 'Português',
        locale: 'pt-PT',
        mesAno: (mes, ano) => `${mes} de ${ano}`,
        resultado: { V: 'V', E: 'E', D: 'D' },
        titulo: '📊 **Estatísticas de {periodo}**',
        top: '**Top 10 do mês**',
        premios: '**Prémios do mês**',
        kills: '🔫 Mais kills: {jogador} ({valor})',
        aim: '🎯 Melhor aim: {jogador} ({valor} de precisão)',
        hs: '🧠 Melhor HS%: {jogador} ({valor})',
        flash: '💡 Flash king: {jogador} ({valor} inimigos cegos)',
        teamflash: '🤦 Rei das team flashes: {jogador} ({valor} aliados cegos)',
        partidas: '🎮 Quem jogou mais: {jogador} ({valor} partidas)',
        semElegiveis: 'Ninguém jogou pelo menos {minimo} partidas em {periodo}, por isso este mês não há MVP.',
        partidasN: 'partidas',
        cmd: {
            link: 'Abre {url} para ligares a tua conta Steam. Precisas de uma conta na Leetify com o perfil público.',
            semSite: 'O site ainda não está configurado.',
            add: {
                ok: '✅ {jogador} ficou ligado a **{nome}** (`{steam}`). Encontrei {n} partidas novas na Leetify.',
                depois: '✅ {jogador} ficou ligado a **{nome}** (`{steam}`). A Leetify não respondeu agora; as partidas chegam na próxima recolha.',
                privado: '⚠️ {jogador} ficou ligado a **{nome}** (`{steam}`), mas o perfil Leetify é privado. Tem de o pôr público em leetify.com → Settings → Privacy e depois correr `/add` outra vez.',
                semConta: '⚠️ {jogador} ficou ligado a `{steam}`, mas esta conta Steam não tem conta na Leetify. Tem de criar uma em leetify.com com a mesma Steam e depois correr `/add` outra vez.',
                movido: '↪️ Esta conta Steam estava ligada a {antigo}, que ficou sem conta.',
                semLeetify: '⚠️ {jogador} ficou ligado à conta Steam `{steam}`, mas a Leetify não encontrou o perfil. É preciso ter conta em leetify.com e o perfil público (Leetify → Settings → Privacy). O bot tenta outra vez uma vez por dia.',
                invalido: 'Isso não parece um Steam64 ID. Usa o número de 17 dígitos (7656119…) ou o link steamcommunity.com/profiles/….',
                sem_permissao: 'Só quem tem a permissão **Manage Server** pode ligar a conta de outra pessoa.',
                steam_ocupada: 'Essa conta Steam já está ligada a outra pessoa.',
            },
            naoLigadoTu: 'Ainda não ligaste a tua conta Steam. Usa `/link`.',
            naoLigado: '{jogador} ainda não ligou a conta Steam.',
            semLeetify: 'A Leetify não encontrou o perfil de {jogador}. É preciso ter conta em leetify.com e o perfil público (Leetify → Settings → Privacy).',
            semPartidas: '{jogador} ainda não tem partidas contadas em {periodo}.',
            stats: '**{jogador}** · {periodo}\n{linha}',
            top: '**Top {categoria}** · {periodo}',
            topVazio: 'Ainda não há partidas contadas em {periodo}.',
            mvp: '**Corrida ao MVP** · {periodo}',
            mvpVazio: 'Ainda ninguém tem {minimo} partidas em {periodo}.',
            mvpFora: '{n} jogador(es) ainda com menos de {minimo} partidas.',
            mvpCaminho: '**A caminho** (menos de {minimo} partidas):',
            mvpFaltam: '{jogador} ({n}/{minimo}, faltam {k})',
            mvpPremios: '**Prémios, por agora:**',
            table: '📊 Tabela de {servidor}:',
            refresh: {
                ok: '🔄 Recolha feita: {novas} partidas novas de {jogadores} jogadores (Leetify e FACEIT).',
                limite: '⏳ A Leetify pediu para esperar um pouco. A recolha parou a meio; tenta outra vez daqui a uns minutos.',
                orcamento: '⛔ Chegou-se ao limite diário de pedidos à Leetify. A recolha volta amanhã (o limite muda-se em Bot settings).',
                sem_permissao: 'Só quem tem a permissão **Manage Server** pode fazer uma recolha.',
            },
            remove: {
                ok: '🗑️ {jogador} saiu da tabela (conta Steam `{steam}`). Pode voltar com `/add` ou `/link`.',
                invalido: 'Isso não parece um Steam64 ID. Usa o número de 17 dígitos (7656119…) ou o link steamcommunity.com/profiles/….',
                sem_permissao: 'Só quem tem a permissão **Manage Server** pode remover outra pessoa. Para te removeres a ti, usa `/remove` sem nada.',
                nao_ligado: 'Essa pessoa ou conta Steam não está na tabela.',
            },
            abrirTabela: 'Abrir tabela',
            sempre: 'sempre',
            categorias: { kills: 'kills', adr: 'ADR', aim: 'aim (precisão)', hs: 'HS%', flashes: 'inimigos cegos', flashpct: 'Flash %', teamflash: 'team flashes', hedmg: 'dano de HE', ace: 'ACEs', k3: '3K', tradepct: 'trade %', matches: 'partidas' },
            ajuda: [
                '**Stats BOT** — estatísticas de CS2 do servidor, a partir da Leetify.',
                'Cada partida dá pontos: vitória 3, empate 1, derrota 0, mais um bónus de 0 a 5 pelo HLTV rating. No dia 1 de cada mês sai o top 10 e o MVP (mínimo {minimo} partidas).',
                '',
                '`/link` liga a tua conta Steam',
                '`/add steam64 [user]` adiciona uma conta Steam pelo Steam64 ID',
                '`/remove [user|steam64]` tira alguém da tabela (outros precisam de Manage Server)',
                '`/refresh` vai já buscar as partidas novas de todos (Manage Server)',
                '`/stats [user]` resumo do mês',
                '`/table` abre a tabela do servidor',
                '`/top category [period]` top 10 por categoria',
                '`/mvp` corrida ao MVP deste mês, com a diferença para o 1.º e quem lidera cada prémio',
                '`/stats-help` esta ajuda',
                '',
                'Tabela completa: {url}',
            ].join('\n'),
        },
    },
    en: {
        nome: 'English',
        locale: 'en-GB',
        mesAno: (mes, ano) => `${mes} ${ano}`,
        resultado: { V: 'W', E: 'D', D: 'L' },
        titulo: '📊 **Stats for {periodo}**',
        top: '**Top 10 of the month**',
        premios: '**Awards of the month**',
        kills: '🔫 Most kills: {jogador} ({valor})',
        aim: '🎯 Best aim: {jogador} ({valor} accuracy)',
        hs: '🧠 Best HS%: {jogador} ({valor})',
        flash: '💡 Flash king: {jogador} ({valor} enemies flashed)',
        teamflash: '🤦 Team flash king: {jogador} ({valor} teammates flashed)',
        partidas: '🎮 Most matches: {jogador} ({valor} matches)',
        semElegiveis: 'Nobody played at least {minimo} matches in {periodo}, so there is no MVP this month.',
        partidasN: 'matches',
        cmd: {
            link: 'Open {url} to link your Steam account. You need a Leetify account with a public profile.',
            semSite: "The website isn't set up yet.",
            add: {
                ok: '✅ {jogador} is now linked to **{nome}** (`{steam}`). Found {n} new matches on Leetify.',
                depois: "✅ {jogador} is now linked to **{nome}** (`{steam}`). Leetify didn't answer right now; the matches arrive with the next collection.",
                privado: '⚠️ {jogador} is now linked to **{nome}** (`{steam}`), but the Leetify profile is private. Make it public on leetify.com → Settings → Privacy, then run `/add` again.',
                semConta: '⚠️ {jogador} is now linked to `{steam}`, but this Steam account has no Leetify account. Create one on leetify.com with the same Steam account, then run `/add` again.',
                movido: '↪️ This Steam account was linked to {antigo}, who is now unlinked.',
                semLeetify: "⚠️ {jogador} is now linked to Steam account `{steam}`, but Leetify couldn't find the profile. It needs an account on leetify.com with a public profile (Leetify → Settings → Privacy). The bot tries again once a day.",
                invalido: "That doesn't look like a Steam64 ID. Use the 17-digit number (7656119…) or a steamcommunity.com/profiles/… link.",
                sem_permissao: "Only members with the **Manage Server** permission can link someone else's account.",
                steam_ocupada: 'That Steam account is already linked to someone else.',
            },
            naoLigadoTu: "You haven't linked your Steam account yet. Use `/link`.",
            naoLigado: "{jogador} hasn't linked a Steam account yet.",
            semLeetify: "Leetify couldn't find {jogador}'s profile. They need an account on leetify.com with a public profile (Leetify → Settings → Privacy).",
            semPartidas: '{jogador} has no counted matches in {periodo} yet.',
            stats: '**{jogador}** · {periodo}\n{linha}',
            top: '**Top {categoria}** · {periodo}',
            topVazio: 'No counted matches in {periodo} yet.',
            mvp: '**MVP race** · {periodo}',
            mvpVazio: 'Nobody has {minimo} matches in {periodo} yet.',
            mvpFora: '{n} player(s) still under {minimo} matches.',
            mvpCaminho: '**On the way** (under {minimo} matches):',
            mvpFaltam: '{jogador} ({n}/{minimo}, {k} to go)',
            mvpPremios: '**Awards, so far:**',
            table: '📊 {servidor} table:',
            refresh: {
                ok: '🔄 Collection done: {novas} new matches from {jogadores} players (Leetify and FACEIT).',
                limite: '⏳ Leetify asked to slow down. The collection stopped halfway; try again in a few minutes.',
                orcamento: "⛔ The daily Leetify request budget is used up. Collections resume tomorrow (change the budget in Bot settings).",
                sem_permissao: 'Only members with the **Manage Server** permission can start a collection.',
            },
            remove: {
                ok: '🗑️ {jogador} is off the table (Steam account `{steam}`). They can come back with `/add` or `/link`.',
                invalido: "That doesn't look like a Steam64 ID. Use the 17-digit number (7656119…) or a steamcommunity.com/profiles/… link.",
                sem_permissao: 'Only members with the **Manage Server** permission can remove someone else. To remove yourself, use `/remove` with nothing else.',
                nao_ligado: "That person or Steam account isn't on the table.",
            },
            abrirTabela: 'Open table',
            sempre: 'all time',
            categorias: { kills: 'kills', adr: 'ADR', aim: 'aim (accuracy)', hs: 'HS%', flashes: 'enemies flashed', flashpct: 'Flash %', teamflash: 'team flashes', hedmg: 'HE damage', ace: 'ACEs', k3: '3Ks', tradepct: 'trade %', matches: 'matches' },
            ajuda: [
                "**Stats BOT** — this server's CS2 stats, from Leetify.",
                'Each match gives points: win 3, draw 1, loss 0, plus a 0–5 bonus from the HLTV rating. On the 1st of each month the bot posts the top 10 and the MVP (at least {minimo} matches).',
                '',
                '`/link` link your Steam account',
                '`/add steam64 [user]` add a Steam account by its Steam64 ID',
                '`/remove [user|steam64]` take someone off the table (others need Manage Server)',
                "`/refresh` fetch everyone's new matches right now (Manage Server)",
                "`/stats [user]` this month's summary",
                "`/table` opens this server's table",
                '`/top category [period]` top 10 by category',
                "`/mvp` this month's MVP race, with the gap to 1st and who leads each award",
                '`/stats-help` this help',
                '',
                'Full table: {url}',
            ].join('\n'),
        },
    },
};
const IDIOMA_POR_OMISSAO = 'pt';

function idioma(codigo) {
    return IDIOMAS[codigo] ?? IDIOMAS[IDIOMA_POR_OMISSAO];
}

function preencher(texto, vars) {
    return texto.replace(/\{(\w+)\}/g, (_, nome) => vars[nome] ?? '');
}

/** "outubro de 2026" / "October 2026" for 'YYYY-MM'. */
function nomeDoMes(mes, codigo) {
    const t = idioma(codigo);
    const [ano, m] = mes.split('-').map(Number);
    const nome = new Date(Date.UTC(ano, m - 1, 15)).toLocaleString(t.locale, { month: 'long', timeZone: 'UTC' });
    return t.mesAno(nome, ano);
}

module.exports = { IDIOMAS, IDIOMA_POR_OMISSAO, idioma, preencher, nomeDoMes };
