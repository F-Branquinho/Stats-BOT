// Rules for a single match: HLTV Rating 1.0, result and MVP points.
// `s` is one player's entry from a Leetify match's `stats` array.

// Leetify data sources that count: Premier, Competitive and FACEIT.
// Wingman ('matchmaking_wingman') and pro demos ('hltv') are left out.
const FONTES_CONTADAS = ['matchmaking', 'matchmaking_competitive', 'faceit'];
const MIN_RONDAS = 10;
const PONTOS_RESULTADO = { V: 3, E: 1, D: 0 };
// Lower bound of each bonus point: 0.80 → 1, 0.95 → 2, ..., 1.40 → 5
const ESCALOES_BONUS = [0.80, 0.95, 1.05, 1.20, 1.40];

/** HLTV Rating 1.0, rounded to 2 decimals, or null without rounds. */
function hltv1(s) {
    const r = s.rounds_count;
    if (!r) return null;
    const kills = (s.total_kills ?? 0) / r / 0.679;
    const sobrevivencia = (r - (s.total_deaths ?? 0)) / r / 0.317;
    const multi = (s.multi1k ?? 0) + 4 * (s.multi2k ?? 0) + 9 * (s.multi3k ?? 0) + 16 * (s.multi4k ?? 0) + 25 * (s.multi5k ?? 0);
    const rating = (kills + 0.7 * sobrevivencia + multi / r / 1.277) / 2.7;
    return Math.round(rating * 100) / 100;
}

/** 'V' (win), 'E' (draw) or 'D' (loss). */
function resultado(s) {
    if (s.rounds_won > s.rounds_lost) return 'V';
    if (s.rounds_won < s.rounds_lost) return 'D';
    return 'E';
}

function bonusRating(rating) {
    return ESCALOES_BONUS.filter((limite) => rating >= limite).length;
}

function pontos(res, rating) {
    return PONTOS_RESULTADO[res] + bonusRating(rating);
}

// Without these a match would get a made-up result and rating
const CAMPOS_ESSENCIAIS = ['total_kills', 'total_deaths', 'rounds_won', 'rounds_lost'];

/** Whether the match goes into the stats (it is stored either way). */
function partidaConta(match, s) {
    return !match.has_banned_player
        && CAMPOS_ESSENCIAIS.every((campo) => typeof s[campo] === 'number')
        && FONTES_CONTADAS.includes(match.data_source)
        && (s.rounds_count ?? 0) >= MIN_RONDAS
        && hltv1(s) !== null;
}

module.exports = { FONTES_CONTADAS, hltv1, resultado, bonusRating, pontos, partidaConta };
