// Client for the FACEIT Data API (https://docs.faceit.com/docs/data-api/data), used for FACEIT matches
// Leetify doesn't have. Matches are converted to the same shape as Leetify's, so the rest of the bot
// stores and scores them the same way.

const API = 'https://open.faceit.com/data/v4';
const TIMEOUT_MS = 15 * 1000;

const valor = (v) => (typeof v === 'function' ? v() : v);
const numero = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

function criarFaceit({ fetch = globalThis.fetch, chave }) {
    async function pedir(caminho, { nulo404 = false } = {}) {
        const res = await fetch(`${API}${caminho}`, {
            headers: { Accept: 'application/json', Authorization: `Bearer ${valor(chave)}` },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (nulo404 && res.status === 404) return null;
        if (!res.ok) throw new Error(`FACEIT ${caminho.split('?')[0]} answered ${res.status}`);
        return res.json();
    }

    return {
        /** The FACEIT account of a Steam ID: { playerId, nivel, elo }, or null when there is none. */
        async jogador(steam64Id) {
            const j = await pedir(`/players?game=cs2&game_player_id=${encodeURIComponent(steam64Id)}`, { nulo404: true });
            if (!j?.player_id) return null;
            return { playerId: j.player_id, nivel: j.games?.cs2?.skill_level ?? null, elo: j.games?.cs2?.faceit_elo ?? null };
        },
        /** The last 20 finished 5v5 CS2 matches of a FACEIT player, newest first. */
        async historico(playerId) {
            const h = await pedir(`/players/${encodeURIComponent(playerId)}/history?game=cs2&limit=20`);
            return (h.items ?? []).filter((m) => m.status === 'finished' && m.game_mode === '5v5');
        },
        stats: (matchId) => pedir(`/matches/${encodeURIComponent(matchId)}/stats`),
    };
}

/**
 * A FACEIT match (history item + match stats) as a Leetify-shaped { match, stats } for one player,
 * or null if the player isn't in the stats.
 */
function converterPartida(item, statsPartida, playerId, steam64Id) {
    const ronda = statsPartida.rounds?.[0];
    if (!ronda) return null;
    const indiceEquipa = ronda.teams.findIndex((t) => t.players.some((p) => p.player_id === playerId));
    if (indiceEquipa < 0) return null;
    const equipa = ronda.teams[indiceEquipa];
    const adversaria = ronda.teams[1 - indiceEquipa];
    const p = equipa.players.find((j) => j.player_id === playerId).player_stats;

    const kills = numero(p.Kills);
    const [k2, k3, k4, k5] = ['Double Kills', 'Triple Kills', 'Quadro Kills', 'Penta Kills'].map((c) => numero(p[c]));
    return {
        match: {
            id: item.match_id,
            data_source_match_id: item.match_id,
            data_source: 'faceit',
            finished_at: new Date(item.finished_at * 1000).toISOString(),
            map_name: ronda.round_stats?.Map ?? null,
            has_banned_player: false,
        },
        stats: {
            steam64_id: steam64Id,
            total_kills: kills,
            total_deaths: numero(p.Deaths),
            total_assists: numero(p.Assists),
            total_hs_kills: numero(p.Headshots),
            rounds_count: numero(ronda.round_stats?.Rounds),
            rounds_won: numero(equipa.team_stats?.['Final Score']),
            rounds_lost: numero(adversaria?.team_stats?.['Final Score']),
            // Rounds with a single kill: every kill not part of a multi-kill
            multi1k: Math.max(0, kills - 2 * k2 - 3 * k3 - 4 * k4 - 5 * k5),
            multi2k: k2,
            multi3k: k3,
            multi4k: k4,
            multi5k: k5,
            total_damage: numero(p.Damage),
            mvps: numero(p.MVPs),
            flashbang_thrown: numero(p['Flash Count']),
            flashbang_hit_foe: numero(p['Enemies Flashed']),
            initial_team_number: indiceEquipa + 1,
        },
    };
}

module.exports = { criarFaceit, converterPartida };
