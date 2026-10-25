const { ordenarPorPontos, MIN_PARTIDAS_MVP } = require('./leaderboard');
const { idioma, preencher, nomeDoMes } = require('./i18n');

// Award → table column. Only eligible players compete, except for most matches.
const PREMIOS = {
    kills: 'kills',
    aim: 'precisao',
    hs: 'hs',
    flash: 'cegos',
    teamflash: 'teamflashes',
    partidas: 'partidas',
};

function melhor(linhas, coluna) {
    const ordenadas = [...linhas].sort((a, b) => b[coluna] - a[coluna] || ordenarPorPontos(a, b));
    return ordenadas.length ? { steam64Id: ordenadas[0].steam64Id, valor: ordenadas[0][coluna] } : null;
}

/** `linhas` are a month's table rows (leaderboard.tabela). */
function escolherVencedores(linhas) {
    const elegiveis = linhas.filter((l) => l.elegivel).sort(ordenarPorPontos);
    const premios = {};
    for (const [premio, coluna] of Object.entries(PREMIOS)) {
        premios[premio] = melhor(premio === 'partidas' ? linhas : elegiveis, coluna);
    }
    return { top: elegiveis.slice(0, 10), premios };
}

const EMOJIS = { mvp: '🏆', kills: '🔫', aim: '🎯', hs: '🧠', flash: '💡', teamflash: '🤦', partidas: '🎮' };

/**
 * The awards each player is winning, for the table: Map steam64Id → [{ premio, emoji, valor }],
 * with the MVP (1st in points) first.
 */
function premiosPorJogador(vencedores) {
    const mapa = new Map();
    const juntar = (steam64Id, premio, valor) => {
        if (!mapa.has(steam64Id)) mapa.set(steam64Id, []);
        mapa.get(steam64Id).push({ premio, emoji: EMOJIS[premio], valor });
    };
    if (vencedores.top[0]) juntar(vencedores.top[0].steam64Id, 'mvp', vencedores.top[0].pontos);
    for (const premio of Object.keys(PREMIOS)) {
        const v = vencedores.premios[premio];
        if (v) juntar(v.steam64Id, premio, v.valor);
    }
    return mapa;
}

const percentagem = (v) => `${Math.round(v * 100)}%`;
const FORMATOS = { aim: percentagem, hs: percentagem };

/** The report message, in the server's language. `mencao(steam64Id)` returns the player's mention. */
function mensagemRelatorio({ vencedores, mes, idioma: codigo, mencao }) {
    const t = idioma(codigo);
    const periodo = nomeDoMes(mes, codigo);
    const titulo = preencher(t.titulo, { periodo });
    if (vencedores.top.length === 0) {
        return `${titulo}\n\n${preencher(t.semElegiveis, { minimo: MIN_PARTIDAS_MVP, periodo })}`;
    }

    const top = vencedores.top.map((l, i) => {
        const registo = `${l.vitorias}${t.resultado.V} ${l.empates}${t.resultado.E} ${l.derrotas}${t.resultado.D}`;
        const texto = `${i + 1}. ${mencao(l.steam64Id)} — ${l.pontos} pts · ${registo} · ${l.hltv.toFixed(2)}`;
        return i === 0 ? `🏆 ${texto}` : texto;
    });
    const premios = Object.keys(PREMIOS)
        .filter((p) => vencedores.premios[p])
        .map((p) => {
            const { steam64Id, valor } = vencedores.premios[p];
            return preencher(t[p], { jogador: mencao(steam64Id), valor: (FORMATOS[p] ?? String)(valor) });
        });

    return [titulo, '', t.top, ...top, '', t.premios, ...premios].join('\n');
}

module.exports = { escolherVencedores, mensagemRelatorio, premiosPorJogador };
