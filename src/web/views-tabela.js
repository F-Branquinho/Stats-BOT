// Server table and player profile pages
const { esc, avatarUtilizador, iconeServidor, layout, cabecalho } = require('./views');
const { nomeDoMes } = require('../i18n');
const { agoraLisboa } = require('../periodos');

const PERIODOS = [['mes', 'This month'], ['mes_passado', 'Last month'], ['sempre', 'All time']];
const FONTES = { matchmaking: 'Premier', matchmaking_competitive: 'Competitive', faceit: 'FACEIT' };

const percentagem = (v) => `${Math.round(v * 100)}%`;
const decimal = (v) => (typeof v === 'number' ? v.toFixed(2) : '—');
// Leetify shows its rating ×100 with a sign, e.g. +1.17
const leetify = (v) => (typeof v === 'number' ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}` : '—');
const nomeMapa = (mapa) => {
    const nome = String(mapa ?? '').replace(/^[a-z]+_/, '');
    return nome ? nome[0].toUpperCase() + nome.slice(1) : '—';
};

// [column key, header, how the value is shown]
const COLUNAS = [
    ['partidas', 'Matches', String],
    ['vitorias', 'W–D–L', (_, l) => `${l.vitorias}–${l.empates}–${l.derrotas}`],
    ['pontos', 'Points', String],
    ['hltv', 'HLTV', decimal],
    ['kills', 'Kills', String],
    ['kd', 'K/D', decimal],
    ['hs', 'HS%', percentagem],
    ['aim', 'Aim', (v) => (typeof v === 'number' ? Math.round(v) : '—')],
    ['flashes', 'Flashes', String],
    ['cegos', 'Enemies flashed', String],
    ['teamflashes', 'Team flashes', String],
    ['flashPct', 'Flash %', percentagem],
    ['tfPct', 'TF %', percentagem],
    ['leetify', 'Leetify', leetify],
];
const COLUNAS_VALIDAS = new Set(COLUNAS.map(([c]) => c));

// Award → tooltip text and how its value is shown
const PREMIOS = {
    mvp: ['the MVP race', (v) => `${v} points`],
    kills: ['most kills', String],
    aim: ['best aim', percentagem],
    hs: ['best HS%', percentagem],
    flash: ['most enemies flashed', String],
    teamflash: ['most team flashes', String],
    partidas: ['most matches', String],
};
const LEGENDA = '🏆 MVP · 🔫 most kills · 🎯 best aim · 🧠 best HS% · 💡 most enemies flashed · 🤦 most team flashes · 🎮 most matches';

function emojisPremios(lista, periodo) {
    return (lista ?? []).map(({ premio, emoji, valor }) => {
        const [nome, formato] = PREMIOS[premio];
        const texto = premio === 'mvp'
            ? `${periodo === 'mes' ? 'Leading' : 'Won'} the MVP race (${formato(valor)})`
            : `${periodo === 'mes' ? 'Leading' : 'Won'}: ${nome} (${formato(valor)})`;
        return `<span class="premio" title="${esc(texto)}">${emoji}</span>`;
    }).join('');
}

function nomePeriodo(periodo) {
    return PERIODOS.find(([p]) => p === periodo)?.[1] ?? '';
}

function topoServidor(guild, subtitulo) {
    return `<div class="servidor" style="margin-bottom:16px">
  ${iconeServidor(guild.id, guild.name, guild.icon)}
  <div class="nome"><h1 style="margin:0">${esc(guild.name)}</h1><span class="suave">${esc(subtitulo)}</span></div>
</div>`;
}

/**
 * `linhas` are leaderboard rows plus { discordId, nome, avatar }, already sorted.
 * `premios`: Map steam64Id → awards that player is winning (report.premiosPorJogador); empty for all time.
 */
function paginaTabela({ sessao, guild, linhas, periodo, ordem, premios = new Map() }) {
    const url = (p, o) => esc(`/s/${guild.id}?periodo=${p}&ordem=${o}`);
    const mensal = periodo !== 'sempre';

    const periodos = PERIODOS.map(([p, nome]) => `<a href="${url(p, ordem)}"${p === periodo ? ' class="ativo"' : ''}>${nome}</a>`).join('');
    const cabecalhos = COLUNAS.map(([c, nome]) => `<th><a href="${url(periodo, c)}"${c === ordem ? ' class="ativo"' : ''}>${nome}</a></th>`).join('');
    const corpo = linhas.map((l, i) => {
        const nota = mensal && !l.elegivel ? '<span class="nota">not eligible for MVP (under 5 matches)</span>' : '';
        const celulas = COLUNAS.map(([c, , formato]) => `<td>${esc(formato(l[c], l))}</td>`).join('');
        return `<tr${mensal && !l.elegivel ? ' class="inelegivel"' : ''}>
  <td>${i + 1}</td>
  <td class="jogador"><a href="/s/${esc(guild.id)}/p/${esc(l.discordId)}"><img class="avatar mini" src="${avatarUtilizador(l.discordId, l.avatar)}" alt="">${esc(l.nome)}</a>${mensal ? emojisPremios(premios.get(l.steam64Id), periodo) : ''}${nota}</td>
  ${celulas}
</tr>`;
    }).join('');

    const tabela = linhas.length
        ? `<div class="tabela-wrap"><table>
<thead><tr><th>#</th><th>Player</th>${cabecalhos}</tr></thead>
<tbody>${corpo}</tbody>
</table></div>`
        : `<div class="cartao"><p>No counted matches in this period yet.</p>
  <p class="suave">To show up here, <a href="/link">link your Steam account</a> and play Premier, Competitive or FACEIT. New matches are fetched every 30 minutes from 16:00 to 04:00.</p></div>`;

    return layout(`${guild.name}: CS2 stats`, `
${cabecalho(sessao)}
${topoServidor(guild, `CS2 stats · ${nomePeriodo(periodo)}`)}
<nav class="periodos">${periodos}</nav>
${tabela}
${mensal && linhas.length ? `<p class="legenda">${periodo === 'mes' ? 'Leading this month' : 'Winners'}: ${LEGENDA}</p>` : ''}
<p class="ajuda">Points per match: win 3, draw 1, loss 0, plus 0–5 for the HLTV 1.0 rating (0.80 → 1, 0.95 → 2, 1.05 → 3, 1.20 → 4, 1.40 → 5).
MVP of the month: most points with at least 5 matches. Aim is the current Leetify aim rating.
Flash % and TF % are enemies and teammates blinded per flash thrown (one flash can blind several people, so they can go over 100%).</p>`, { larga: true });
}

function paginaPerfil({ sessao, guild, jogador, total, meses, partidas }) {
    const resumo = total
        ? `<div class="cartoes">
  <div class="cartao"><h3>${total.pontos} points</h3><p>${total.partidas} matches · ${total.vitorias}–${total.empates}–${total.derrotas}</p></div>
  <div class="cartao"><h3>HLTV ${decimal(total.hltv)}</h3><p>K/D ${decimal(total.kd)} · HS ${percentagem(total.hs)} · ${total.kills} kills</p></div>
  <div class="cartao"><h3>💡 ${total.cegos} · 🤦 ${total.teamflashes}</h3><p>Enemies flashed · team flashes (${total.flashes} flashes thrown: ${percentagem(total.flashPct)} · ${percentagem(total.tfPct)})</p></div>
</div>`
        : '<div class="cartao"><p>No counted matches yet.</p></div>';

    const linhasMeses = meses.map((m) => `<tr><td>${esc(nomeDoMes(m.mes, 'en'))}</td><td>${m.partidas}</td><td>${m.vitorias}–${m.empates}–${m.derrotas}</td><td>${m.pontos}</td><td>${decimal(m.hltv)}</td></tr>`).join('');
    const linhasPartidas = partidas.map((p) => {
        const quando = agoraLisboa(new Date(p.finished_at));
        return `<tr>
  <td>${esc(quando.data)} ${String(quando.hora).padStart(2, '0')}:${String(quando.minuto).padStart(2, '0')}</td>
  <td>${esc(nomeMapa(p.map_name))} <span class="nota">${esc(FONTES[p.data_source] ?? p.data_source)}</span></td>
  <td><span class="res-${esc(p.result)}">${esc(p.rounds_won)}–${esc(p.rounds_lost)}</span></td>
  <td>${esc(p.kills)}–${esc(p.deaths)}</td>
  <td>${decimal(p.hltv_rating)}</td>
  <td>${esc(p.points)}</td>
</tr>`;
    }).join('');

    return layout(`${jogador.nome}: CS2 stats`, `
${cabecalho(sessao)}
<p><a href="/s/${esc(guild.id)}">← ${esc(guild.name)}</a></p>
<div class="servidor" style="margin-bottom:16px">
  <img class="icone" src="${avatarUtilizador(jogador.discordId, jogador.avatar)}" alt="">
  <div class="nome"><h1 style="margin:0">${esc(jogador.nome)}</h1>
  <a class="suave" href="https://leetify.com/app/profile/${esc(jogador.steam64Id)}" target="_blank" rel="noopener">Leetify profile</a></div>
</div>
${resumo}
<div class="secao"><h2>By month</h2>
${meses.length ? `<div class="tabela-wrap"><table><thead><tr><th>Month</th><th>Matches</th><th>W–D–L</th><th>Points</th><th>HLTV</th></tr></thead><tbody>${linhasMeses}</tbody></table></div>` : '<p class="suave">Nothing yet.</p>'}
</div>
<div class="secao"><h2>Last matches</h2>
${partidas.length ? `<div class="tabela-wrap"><table><thead><tr><th>When</th><th>Map</th><th>Score</th><th>K–D</th><th>HLTV</th><th>Points</th></tr></thead><tbody>${linhasPartidas}</tbody></table></div>` : '<p class="suave">Nothing yet.</p>'}
</div>`, { larga: true });
}

module.exports = { COLUNAS_VALIDAS, paginaTabela, paginaPerfil };
