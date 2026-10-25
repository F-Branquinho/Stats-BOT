// Server table and player profile pages
const { esc, avatarUtilizador, iconeServidor, layout, cabecalho } = require('./views');
const { nomeDoMes } = require('../i18n');
const { agoraLisboa } = require('../periodos');
const { ordenarPor } = require('../leaderboard');

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

// Formats for values that can be missing (matches stored before a column existed): shown as "—"
const ou = (formato) => (v, l) => (typeof v === 'number' ? formato(v, l) : '—');
const inteiro = ou((v) => String(Math.round(v)));

// The tables on the server page. Each one is sorted by its own query parameter.
// Columns: [key, header, format, lowest first?]
const TABELAS = [
    {
        id: 'principal', param: 'ordem', padrao: 'pontos', titulo: null,
        colunas: [
            ['partidas', 'Matches', String],
            ['vitorias', 'W–D–L', (_, l) => `${l.vitorias}–${l.empates}–${l.derrotas}`],
            ['pontos', 'Points', String],
            ['hltv', 'HLTV', decimal],
            ['adr', 'ADR', inteiro],
            ['kills', 'Kills', String],
            ['kd', 'K/D', decimal],
            ['hs', 'HS%', percentagem],
            ['aim', 'Aim', inteiro],
            ['leetify', 'Leetify', leetify],
        ],
    },
    {
        id: 'utilitarios', param: 'u', padrao: 'cegos', titulo: '💣 Utility',
        colunas: [
            ['flashes', 'Flashes', String],
            ['cegos', 'Enemies flashed', String],
            ['flashPct', 'Flash %', percentagem],
            ['duracaoCegueira', 'Blind time', ou((v) => `${v.toFixed(1)}s`)],
            ['flashKills', 'Flash → kill', String],
            ['flashAssists', 'Flash assists', String],
            ['teamflashes', 'Team flashes', String],
            ['tfPct', 'TF %', percentagem],
            ['heAtiradas', 'HEs', String],
            ['heDano', 'HE dmg', inteiro],
            ['hePorNade', 'HE/nade', ou((v) => v.toFixed(1))],
            ['heTeam', 'HE team', inteiro],
            ['molotovs', 'Molotovs', String],
            ['smokes', 'Smokes', String],
            ['granadasPorRonda', 'Nades/round', ou((v) => v.toFixed(2))],
            ['utilDesperdicada', 'Unused util', ou((v) => `$${Math.round(v)}`)],
        ],
    },
    {
        id: 'multikills', param: 'k', padrao: 'k3', titulo: '🔥 Multi-kills and trades',
        colunas: [
            ['k2', '2K', String],
            ['k3', '3K', String],
            ['k4', '4K', String],
            ['k5', 'ACE', String],
            ['mvps', 'MVP stars', String],
            ['tradeKills', 'Trade kills', String],
            ['tradePct', 'Trade %', ou(percentagem)],
            ['tradedDeaths', 'Traded deaths', String],
            ['tradedPct', 'Traded %', ou(percentagem)],
            ['clutch', 'Clutch', leetify],
            ['opening', 'Opening', leetify],
        ],
    },
    {
        id: 'mira', param: 'm', padrao: 'precisao', titulo: '🎯 Aim',
        colunas: [
            ['precisaoGeral', 'Accuracy', ou(percentagem)],
            ['precisao', 'Accuracy (spotted)', percentagem],
            ['hs', 'HS%', percentagem],
            ['spray', 'Spray', ou(percentagem)],
            ['counterStrafing', 'Counter-strafe', ou(percentagem)],
            ['preaim', 'Preaim', ou((v) => `${v.toFixed(1)}°`), true],
            ['reacao', 'Reaction', ou((v) => `${Math.round(v)} ms`), true],
        ],
    },
];

/** The column a table is sorted by: the one asked for, if that table has it, else its default. */
function ordemValida(tabela, pedida) {
    return tabela.colunas.some(([c]) => c === pedida) ? pedida : tabela.padrao;
}

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
 * `linhas` are leaderboard rows plus { discordId, nome, avatar }. The main table is sorted by `ordem`,
 * the others by `ordens` ({ u, k, m }: utility, multi-kills, aim).
 * `premios`: Map steam64Id → awards that player is winning (report.premiosPorJogador); empty for all time.
 */
function paginaTabela({ sessao, guild, linhas, periodo, ordem, ordens = {}, premios = new Map() }) {
    const mensal = periodo !== 'sempre';
    // Every link keeps the period and the sort of every table
    const atuais = Object.fromEntries(TABELAS.map((t) => [t.param, ordemValida(t, t.param === 'ordem' ? ordem : ordens[t.param])]));
    const url = (mudancas = {}, ancora = '') => {
        const p = { periodo, ...atuais, ...mudancas };
        return esc(`/s/${guild.id}?periodo=${p.periodo}&${TABELAS.map((t) => `${t.param}=${p[t.param]}`).join('&')}${ancora}`);
    };

    const jogador = (l, comPremios) => {
        const nota = comPremios && mensal && !l.elegivel ? '<span class="nota">not eligible for MVP (under 5 matches)</span>' : '';
        const emojis = comPremios && mensal ? emojisPremios(premios.get(l.steam64Id), periodo) : '';
        return `<td class="jogador"><a href="/s/${esc(guild.id)}/p/${esc(l.discordId)}"><img class="avatar mini" src="${avatarUtilizador(l.discordId, l.avatar)}" alt="">${esc(l.nome)}</a>${emojis}${nota}</td>`;
    };

    function renderTabela(t) {
        const coluna = atuais[t.param];
        const crescente = Boolean(t.colunas.find(([c]) => c === coluna)?.[3]);
        const ordenadas = ordenarPor(linhas, coluna, { crescente });
        const ancora = t.titulo ? `#${t.id}` : '';
        const cabecalhos = t.colunas.map(([c, nome]) => `<th><a href="${url({ [t.param]: c }, ancora)}"${c === coluna ? ' class="ativo"' : ''}>${nome}</a></th>`).join('');
        const corpo = ordenadas.map((l, i) => `<tr${mensal && !l.elegivel ? ' class="inelegivel"' : ''}>
  <td>${i + 1}</td>
  ${jogador(l, !t.titulo)}
  ${t.colunas.map(([c, , formato]) => `<td>${esc(formato(l[c], l))}</td>`).join('')}
</tr>`).join('');
        return `${t.titulo ? `<h2 class="titulo-tabela" id="${t.id}">${t.titulo}</h2>` : ''}<div class="tabela-wrap"><table>
<thead><tr><th>#</th><th>Player</th>${cabecalhos}</tr></thead>
<tbody>${corpo}</tbody>
</table></div>`;
    }

    const periodos = PERIODOS.map(([p, nome]) => `<a href="${url({ periodo: p })}"${p === periodo ? ' class="ativo"' : ''}>${nome}</a>`).join('');
    const vazio = `<div class="cartao"><p>No counted matches in this period yet.</p>
  <p class="suave">To show up here, <a href="/link">link your Steam account</a> and play Premier, Competitive or FACEIT. New matches are fetched every 30 minutes from 16:00 to 04:00.</p></div>`;
    const [principal, ...outras] = TABELAS;

    return layout(`${guild.name}: CS2 stats`, `
${cabecalho(sessao)}
${topoServidor(guild, `CS2 stats · ${nomePeriodo(periodo)}`)}
<nav class="periodos">${periodos}</nav>
${linhas.length ? renderTabela(principal) : vazio}
${mensal && linhas.length ? `<p class="legenda">${periodo === 'mes' ? 'Leading this month' : 'Winners'}: ${LEGENDA}</p>` : ''}
<p class="ajuda">Points per match: win 3, draw 1, loss 0, plus 0–5 for the HLTV 1.0 rating (0.80 → 1, 0.95 → 2, 1.05 → 3, 1.20 → 4, 1.40 → 5).
MVP of the month: most points with at least 5 matches. Aim, Clutch and Opening are the current Leetify ratings.</p>
${linhas.length ? outras.map(renderTabela).join('\n') : ''}
${linhas.length ? `<p class="ajuda">Flash % and TF % are enemies and teammates blinded per flash thrown (one flash can blind several people, so they can go over 100%).
Blind time is the average per enemy flashed. Unused util is the average value of grenades still held when dying.
Trade % is how often a trade attempt worked; Traded % is how often a teammate avenged the death.
Leetify doesn't give molotov damage or 1vX clutches. "—" means no data yet for matches stored before that column existed.</p>` : ''}`, { larga: true });
}

function paginaPerfil({ sessao, guild, jogador, total, meses, partidas }) {
    const resumo = total
        ? `<div class="cartoes">
  <div class="cartao"><h3>${total.pontos} points</h3><p>${total.partidas} matches · ${total.vitorias}–${total.empates}–${total.derrotas}</p></div>
  <div class="cartao"><h3>HLTV ${decimal(total.hltv)}</h3><p>K/D ${decimal(total.kd)} · HS ${percentagem(total.hs)} · ${total.kills} kills</p></div>
  <div class="cartao"><h3>💥 ${Math.round(total.heDano)} HE damage</h3><p>${(total.hePorNade ?? 0).toFixed(1)} per HE · ${Math.round(total.heTeam)} to teammates</p></div>
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

module.exports = { TABELAS, ordemValida, paginaTabela, paginaPerfil };
