// Texts the bot posts in a server (the monthly report), in each supported language.
// Placeholders: {nome}.

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
