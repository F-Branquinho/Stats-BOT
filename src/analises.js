// Group analyses over stored match rows (db.partidasDe): duos, maps and single-match records

const MIN_PARTIDAS_DUO = 2;
const MIN_PARTIDAS_MAPA = 3;

const arredondar = (n) => Math.round(n * 100) / 100;
const media = (lista, campo) => (lista.length ? lista.reduce((t, p) => t + (p[campo] ?? 0), 0) / lista.length : 0);

function agrupar(lista, chave) {
    const grupos = new Map();
    for (const item of lista) {
        const k = chave(item);
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(item);
    }
    return grupos;
}

function contarResultados(linhas) {
    const conta = (r) => linhas.filter((l) => l.result === r).length;
    return { vitorias: conta('V'), empates: conta('E'), derrotas: conta('D') };
}

/**
 * Pairs of linked players who played the same match on the same team (needs the team, stored from v4 on).
 * At least 2 matches together; best win % first.
 */
function duos(partidas) {
    const pares = new Map();
    for (const linhas of agrupar(partidas.filter((p) => p.team !== null && p.team !== undefined), (p) => p.match_id).values()) {
        for (const equipa of agrupar(linhas, (p) => p.team).values()) {
            const ordenadas = [...equipa].sort((x, y) => x.steam64_id.localeCompare(y.steam64_id));
            for (let i = 0; i < ordenadas.length; i++) {
                for (let j = i + 1; j < ordenadas.length; j++) {
                    const chave = `${ordenadas[i].steam64_id}|${ordenadas[j].steam64_id}`;
                    if (!pares.has(chave)) pares.set(chave, []);
                    pares.get(chave).push([ordenadas[i], ordenadas[j]]);
                }
            }
        }
    }
    return [...pares]
        .filter(([, jogos]) => jogos.length >= MIN_PARTIDAS_DUO)
        .map(([chave, jogos]) => {
            const [a, b] = chave.split('|');
            const resultados = contarResultados(jogos.map(([x]) => x));
            return {
                a, b, partidas: jogos.length, ...resultados,
                pctVitorias: resultados.vitorias / jogos.length,
                hltv: arredondar(media(jogos.flat(), 'hltv_rating')),
            };
        })
        .sort((x, y) => y.pctVitorias - x.pctVitorias || y.partidas - x.partidas);
}

/** Per map: matches the group played, win %, average HLTV and the best player there (3+ matches). Most played first. */
function mapas(partidas) {
    return [...agrupar(partidas, (p) => p.map_name ?? '?')]
        .map(([mapa, linhas]) => {
            const candidatos = [...agrupar(linhas, (p) => p.steam64_id)]
                .filter(([, ls]) => ls.length >= MIN_PARTIDAS_MAPA)
                .map(([steam64Id, ls]) => ({ steam64Id, hltv: arredondar(media(ls, 'hltv_rating')), partidas: ls.length }))
                .sort((x, y) => y.hltv - x.hltv || y.partidas - x.partidas);
            return {
                mapa,
                partidas: new Set(linhas.map((l) => l.match_id)).size,
                pctVitorias: contarResultados(linhas).vitorias / linhas.length,
                hltv: media(linhas, 'hltv_rating'),
                melhor: candidatos[0] ?? null,
            };
        })
        .sort((x, y) => y.partidas - x.partidas || x.mapa.localeCompare(y.mapa));
}

/** One player's maps (most played first, then best win %), with their best and worst map by win % among those with 3+ matches. */
function mapasJogador(partidas) {
    const lista = [...agrupar(partidas, (p) => p.map_name ?? '?')]
        .map(([mapa, linhas]) => {
            const resultados = contarResultados(linhas);
            return { mapa, partidas: linhas.length, ...resultados, pctVitorias: resultados.vitorias / linhas.length, hltv: media(linhas, 'hltv_rating') };
        })
        .sort((x, y) => y.partidas - x.partidas || y.pctVitorias - x.pctVitorias || x.mapa.localeCompare(y.mapa));
    const elegiveis = lista.filter((m) => m.partidas >= MIN_PARTIDAS_MAPA)
        .sort((x, y) => y.pctVitorias - x.pctVitorias || y.hltv - x.hltv);
    return {
        mapas: lista,
        melhor: elegiveis[0]?.mapa ?? null,
        pior: elegiveis.length > 1 ? elegiveis.at(-1).mapa : null,
    };
}

/** The single best match in the period for HLTV rating, kills and damage. */
function recordes(partidas) {
    const melhor = (campo) => {
        const com = partidas.filter((p) => typeof p[campo] === 'number');
        if (!com.length) return null;
        const p = com.reduce((x, y) => (y[campo] > x[campo] ? y : x));
        return { steam64Id: p.steam64_id, valor: p[campo], mapa: p.map_name, quando: p.finished_at };
    };
    return { hltv: melhor('hltv_rating'), kills: melhor('kills'), dano: melhor('total_damage') };
}

module.exports = { duos, mapas, mapasJogador, recordes };
