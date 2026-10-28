const Database = require('better-sqlite3');
const { hltv1, resultado, pontos, partidaConta } = require('./rating');
const { agoraLisboa } = require('./periodos');

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS players (
    discord_id      TEXT PRIMARY KEY,
    steam64_id      TEXT NOT NULL UNIQUE,
    name            TEXT,
    avatar          TEXT,
    linked_at       TEXT NOT NULL,
    leetify_status  TEXT NOT NULL DEFAULT 'ok',
    last_fetched_at TEXT,
    profile_at      TEXT
);
CREATE TABLE IF NOT EXISTS matches (
    id                TEXT PRIMARY KEY,
    finished_at       TEXT NOT NULL,
    map_name          TEXT,
    data_source       TEXT,
    has_banned_player INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS player_matches (
    match_id                  TEXT NOT NULL REFERENCES matches(id),
    steam64_id                TEXT NOT NULL,
    kills                     INTEGER, deaths INTEGER, assists INTEGER, hs_kills INTEGER,
    rounds                    INTEGER, rounds_won INTEGER, rounds_lost INTEGER,
    multi1k INTEGER, multi2k INTEGER, multi3k INTEGER, multi4k INTEGER, multi5k INTEGER,
    dpr                       REAL,
    leetify_rating            REAL,
    accuracy_head             REAL,
    shots_fired_enemy_spotted INTEGER,
    shots_hit_enemy_spotted   INTEGER,
    preaim                    REAL,
    reaction_time             REAL,
    flash_thrown              INTEGER,
    flash_hit_foe             INTEGER,
    flash_hit_friend          INTEGER,
    flash_leading_to_kill     INTEGER,
    he_thrown INTEGER, smoke_thrown INTEGER, molotov_thrown INTEGER,
    result                    TEXT,
    hltv_rating               REAL,
    points                    INTEGER,
    counted                   INTEGER NOT NULL,
    PRIMARY KEY (match_id, steam64_id)
);
CREATE INDEX IF NOT EXISTS player_matches_steam ON player_matches (steam64_id);
CREATE TABLE IF NOT EXISTS player_profile (
    steam64_id  TEXT PRIMARY KEY,
    aim         REAL, utility REAL, positioning REAL,
    premier     INTEGER, faceit_elo INTEGER,
    updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS guilds (
    guild_id          TEXT PRIMARY KEY,
    report_channel_id TEXT,
    language          TEXT NOT NULL DEFAULT 'pt',
    report_enabled    INTEGER NOT NULL DEFAULT 1,
    configured_at     TEXT
);
CREATE TABLE IF NOT EXISTS reports (
    guild_id TEXT NOT NULL,
    month    TEXT NOT NULL,
    sent_at  TEXT NOT NULL,
    PRIMARY KEY (guild_id, month)
);
CREATE TABLE IF NOT EXISTS rank_history (
    steam64_id TEXT NOT NULL,
    day        TEXT NOT NULL,
    em         TEXT NOT NULL,
    premier    INTEGER,
    faceit_elo INTEGER,
    PRIMARY KEY (steam64_id, day)
);
CREATE TABLE IF NOT EXISTS api_usage (
    day      TEXT PRIMARY KEY,
    requests INTEGER NOT NULL
);
`;

const VERSAO = 4;

// Columns added after v1, in this order, by migrar() (also on a new database, so both end up the same).
// Matches stored before a column existed get it filled the next time Leetify sends them.
const COLUNAS_TARDIAS = {
    // v2: HE grenade damage (totals per match)
    he_foes_damage: 'REAL',
    he_friends_damage: 'REAL',
    // v3: ADR, utility, trades, MVPs and aim details
    total_damage: 'INTEGER',
    flash_duration: 'REAL',
    flash_assist: 'INTEGER',
    utility_on_death: 'REAL',
    mvps: 'INTEGER',
    trade_kill_attempts: 'INTEGER',
    trade_kills_succeed: 'INTEGER',
    traded_death_attempts: 'INTEGER',
    traded_deaths_succeed: 'INTEGER',
    shots_fired: 'INTEGER',
    shots_hit_foe: 'INTEGER',
    spray_accuracy: 'REAL',
    counter_strafing_good: 'INTEGER',
    counter_strafing_all: 'INTEGER',
    // v4: team (for duos), CT/T side ratings, rounds survived, shots that hit teammates
    team: 'INTEGER',
    ct_leetify: 'REAL',
    t_leetify: 'REAL',
    rounds_survived: 'INTEGER',
    shots_hit_friend: 'INTEGER',
};
// v3: current Leetify clutch and opening ratings
// v4: FACEIT level
const COLUNAS_PERFIL = { clutch: 'REAL', opening: 'REAL', faceit: 'INTEGER' };

function acrescentarColunas(db, tabela, colunas) {
    const existentes = new Set(db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name));
    for (const [coluna, tipo] of Object.entries(colunas)) {
        if (!existentes.has(coluna)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
    }
}

/** Brings a database created by an older version up to date. */
function migrar(db) {
    acrescentarColunas(db, 'player_matches', COLUNAS_TARDIAS);
    acrescentarColunas(db, 'player_profile', COLUNAS_PERFIL);
    db.pragma(`user_version = ${VERSAO}`);
}

const numero = (v) => (typeof v === 'number' ? v : null);

// Every column a match row is inserted with
const COLUNAS_PARTIDA = [
    'match_id', 'steam64_id', 'kills', 'deaths', 'assists', 'hs_kills', 'rounds', 'rounds_won', 'rounds_lost',
    'multi1k', 'multi2k', 'multi3k', 'multi4k', 'multi5k', 'dpr', 'leetify_rating', 'accuracy_head',
    'shots_fired_enemy_spotted', 'shots_hit_enemy_spotted', 'preaim', 'reaction_time',
    'flash_thrown', 'flash_hit_foe', 'flash_hit_friend', 'flash_leading_to_kill',
    'he_thrown', 'smoke_thrown', 'molotov_thrown', 'result', 'hltv_rating', 'points', 'counted',
    ...Object.keys(COLUNAS_TARDIAS),
];

/** The late columns of a match row, from Leetify's per-player stats (null when Leetify doesn't send them). */
function colunasTardias(s) {
    return {
        he_foes_damage: danoHE(s.he_foes_damage_avg, s.he_thrown),
        he_friends_damage: danoHE(s.he_friends_damage_avg, s.he_thrown),
        total_damage: numero(s.total_damage),
        flash_duration: numero(s.flashbang_hit_foe_avg_duration),
        flash_assist: numero(s.flash_assist),
        utility_on_death: numero(s.utility_on_death_avg),
        mvps: numero(s.mvps),
        trade_kill_attempts: numero(s.trade_kill_attempts),
        trade_kills_succeed: numero(s.trade_kills_succeed),
        traded_death_attempts: numero(s.traded_death_attempts),
        traded_deaths_succeed: numero(s.traded_deaths_succeed),
        shots_fired: numero(s.shots_fired),
        shots_hit_foe: numero(s.shots_hit_foe),
        spray_accuracy: numero(s.spray_accuracy),
        counter_strafing_good: numero(s.counter_strafing_shots_good),
        counter_strafing_all: numero(s.counter_strafing_shots_all),
        team: numero(s.initial_team_number),
        ct_leetify: numero(s.ct_leetify_rating),
        t_leetify: numero(s.t_leetify_rating),
        rounds_survived: numero(s.rounds_survived),
        shots_hit_friend: numero(s.shots_hit_friend),
    };
}

/** Leetify gives the average HE damage per grenade; this is the match total. */
function danoHE(media, granadas) {
    return typeof media === 'number' ? Math.round(media * (granadas ?? 0) * 100) / 100 : null;
}

/** Opens (and creates) the database. Use ':memory:' in tests. */
function abrirBD(ficheiro) {
    const db = new Database(ficheiro);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(ESQUEMA);
    migrar(db);

    const q = {
        jogador: db.prepare('SELECT * FROM players WHERE discord_id = ?'),
        jogadorPorSteam: db.prepare('SELECT * FROM players WHERE steam64_id = ?'),
        ligados: db.prepare('SELECT * FROM players ORDER BY linked_at'),
        ligar: db.prepare(`INSERT INTO players (discord_id, steam64_id, name, avatar, linked_at)
            VALUES (@discordId, @steam64Id, @nome, @avatar, @agora)
            ON CONFLICT (discord_id) DO UPDATE SET steam64_id = excluded.steam64_id, name = excluded.name,
                avatar = excluded.avatar, linked_at = excluded.linked_at, leetify_status = 'ok',
                last_fetched_at = NULL, profile_at = NULL`),
        desligar: db.prepare('DELETE FROM players WHERE discord_id = ?'),
        estado: db.prepare('UPDATE players SET leetify_status = ? WHERE steam64_id = ?'),
        recolha: db.prepare('UPDATE players SET last_fetched_at = ? WHERE steam64_id = ?'),
        perfilRecolhido: db.prepare('UPDATE players SET profile_at = ? WHERE steam64_id = ?'),
        // Bans often land days after a match: once Leetify flags it, it stays flagged
        partida: db.prepare(`INSERT INTO matches (id, finished_at, map_name, data_source, has_banned_player)
            VALUES (@id, @finished_at, @map_name, @data_source, @has_banned_player)
            ON CONFLICT (id) DO UPDATE SET has_banned_player = MAX(has_banned_player, excluded.has_banned_player)`),
        descontar: db.prepare('UPDATE player_matches SET counted = 0 WHERE match_id = ?'),
        banida: db.prepare('SELECT has_banned_player FROM matches WHERE id = ?').pluck(),
        jogadorPartida: db.prepare(`INSERT OR IGNORE INTO player_matches (${COLUNAS_PARTIDA.join(', ')})
            VALUES (${COLUNAS_PARTIDA.map((c) => `@${c}`).join(', ')})`),
        // Matches stored before a column existed get it the next time Leetify sends them
        completar: db.prepare(`UPDATE player_matches SET ${Object.keys(COLUNAS_TARDIAS).map((c) => `${c} = COALESCE(${c}, @${c})`).join(', ')}
            WHERE match_id = @match_id AND steam64_id = @steam64_id`),
        contarPartidas: db.prepare('SELECT COUNT(*) AS n FROM matches'),
        perfil: db.prepare('SELECT * FROM player_profile WHERE steam64_id = ?'),
        guardarPerfil: db.prepare(`INSERT INTO player_profile (steam64_id, aim, utility, positioning, premier, faceit, faceit_elo, clutch, opening, updated_at)
            VALUES (@steam64Id, @aim, @utility, @positioning, @premier, @faceit, @faceitElo, @clutch, @opening, @agora)
            ON CONFLICT (steam64_id) DO UPDATE SET aim = excluded.aim, utility = excluded.utility,
                positioning = excluded.positioning, premier = excluded.premier, faceit = excluded.faceit, faceit_elo = excluded.faceit_elo,
                clutch = excluded.clutch, opening = excluded.opening, updated_at = excluded.updated_at`),
        servidor: db.prepare('SELECT * FROM guilds WHERE guild_id = ?'),
        guardarServidor: db.prepare(`INSERT INTO guilds VALUES (@guildId, @reportChannelId, @language, @reportEnabled, @agora)
            ON CONFLICT (guild_id) DO UPDATE SET report_channel_id = excluded.report_channel_id,
                language = excluded.language, report_enabled = excluded.report_enabled`),
        relatorio: db.prepare('SELECT 1 FROM reports WHERE guild_id = ? AND month = ?'),
        marcarRelatorio: db.prepare('INSERT OR IGNORE INTO reports VALUES (?, ?, ?)'),
        pedidos: db.prepare('SELECT requests FROM api_usage WHERE day = ?'),
        contarPedido: db.prepare(`INSERT INTO api_usage VALUES (?, 1)
            ON CONFLICT (day) DO UPDATE SET requests = requests + 1`),
        guardarRank: db.prepare(`INSERT INTO rank_history VALUES (@steam64Id, @dia, @em, @premier, @faceitElo)
            ON CONFLICT (steam64_id, day) DO UPDATE SET em = excluded.em, premier = excluded.premier, faceit_elo = excluded.faceit_elo`),
        rankAntes: db.prepare('SELECT * FROM rank_history WHERE steam64_id = ? AND em < ? ORDER BY em DESC LIMIT 1'),
        ranksDentro: db.prepare(`SELECT * FROM rank_history WHERE steam64_id = ?
            AND (? IS NULL OR em >= ?) AND (? IS NULL OR em < ?) ORDER BY em`),
    };

    /** `forcar` moves a Steam account that is linked to someone else (the old link is removed). */
    const ligarJogador = db.transaction(({ discordId, steam64Id, nome = null, avatar = null, forcar = false }) => {
        const dono = q.jogadorPorSteam.get(steam64Id);
        const outro = dono && dono.discord_id !== discordId;
        if (outro && !forcar) return { ok: false, motivo: 'steam_ocupada' };
        if (outro) q.desligar.run(dono.discord_id);
        q.ligar.run({ discordId, steam64Id, nome, avatar, agora: new Date().toISOString() });
        return outro ? { ok: true, movidoDe: dono.discord_id } : { ok: true };
    });

    const guardarPartida = db.transaction((match, s) => {
        if (!match.id || !match.finished_at || !s.steam64_id) return false;
        const rating = hltv1(s);
        const res = resultado(s);
        if (match.has_banned_player) q.descontar.run(match.id);
        q.partida.run({
            id: match.id,
            finished_at: match.finished_at,
            map_name: match.map_name ?? null,
            data_source: match.data_source ?? null,
            has_banned_player: match.has_banned_player ? 1 : 0,
        });
        const banida = q.banida.get(match.id) === 1;
        const tardias = { match_id: match.id, steam64_id: s.steam64_id, ...colunasTardias(s) };
        const info = q.jogadorPartida.run({
            ...tardias,
            match_id: match.id,
            steam64_id: s.steam64_id,
            kills: s.total_kills ?? 0,
            deaths: s.total_deaths ?? 0,
            assists: s.total_assists ?? 0,
            hs_kills: s.total_hs_kills ?? 0,
            rounds: s.rounds_count ?? 0,
            rounds_won: s.rounds_won ?? 0,
            rounds_lost: s.rounds_lost ?? 0,
            multi1k: s.multi1k ?? 0, multi2k: s.multi2k ?? 0, multi3k: s.multi3k ?? 0,
            multi4k: s.multi4k ?? 0, multi5k: s.multi5k ?? 0,
            dpr: s.dpr ?? null,
            leetify_rating: s.leetify_rating ?? null,
            accuracy_head: s.accuracy_head ?? null,
            shots_fired_enemy_spotted: s.shots_fired_enemy_spotted ?? 0,
            shots_hit_enemy_spotted: s.shots_hit_enemy_spotted ?? 0,
            preaim: s.preaim ?? null,
            reaction_time: s.reaction_time ?? null,
            flash_thrown: s.flashbang_thrown ?? 0,
            flash_hit_foe: s.flashbang_hit_foe ?? 0,
            flash_hit_friend: s.flashbang_hit_friend ?? 0,
            flash_leading_to_kill: s.flashbang_leading_to_kill ?? 0,
            he_thrown: s.he_thrown ?? 0,
            smoke_thrown: s.smoke_thrown ?? 0,
            molotov_thrown: s.molotov_thrown ?? 0,
            result: res,
            hltv_rating: rating,
            points: rating === null ? 0 : pontos(res, rating),
            counted: partidaConta({ ...match, has_banned_player: banida }, s) ? 1 : 0,
        });
        if (info.changes > 0) return true;
        q.completar.run(tardias);
        return false;
    });

    /** Counted matches of these players, newest first, with finished_at in [desde, ate). */
    /** Counted matches of these players, newest first, with finished_at in [desde, ate) and, optionally, only these data sources. */
    function partidasDe(steam64Ids, desde, ate, fontes = null) {
        if (steam64Ids.length === 0 || fontes?.length === 0) return [];
        const marcas = (lista) => lista.map(() => '?').join(', ');
        const filtroFontes = fontes ? `AND m.data_source IN (${marcas(fontes)})` : '';
        return db.prepare(`SELECT pm.*, m.finished_at, m.map_name, m.data_source
            FROM player_matches pm JOIN matches m ON m.id = pm.match_id
            WHERE pm.counted = 1 AND pm.steam64_id IN (${marcas(steam64Ids)}) ${filtroFontes}
              AND (? IS NULL OR m.finished_at >= ?) AND (? IS NULL OR m.finished_at < ?)
            ORDER BY m.finished_at DESC`).all(...steam64Ids, ...(fontes ?? []), desde, desde, ate, ate);
    }

    /**
     * Each player's Premier rating and FACEIT ELO at the start and end of [desde, ate): the start is the last
     * daily snapshot before the period (or its first one), the end is its last one (or the start, if none).
     */
    function ranksEntre(steam64Ids, desde, ate) {
        const resultado = new Map();
        const valores = (r) => ({ premier: r.premier, faceitElo: r.faceit_elo });
        for (const s of steam64Ids) {
            const antes = desde ? q.rankAntes.get(s, desde) : null;
            const dentro = q.ranksDentro.all(s, desde, desde, ate, ate);
            const inicio = antes ?? dentro[0];
            if (!inicio) continue;
            resultado.set(s, { inicio: valores(inicio), fim: valores(dentro.at(-1) ?? inicio) });
        }
        return resultado;
    }

    return {
        bd: db,
        fechar: () => db.close(),
        ligarJogador,
        desligarJogador: (discordId) => q.desligar.run(discordId),
        jogador: (discordId) => q.jogador.get(discordId),
        jogadorPorSteam: (steam64Id) => q.jogadorPorSteam.get(steam64Id),
        jogadoresLigados: () => q.ligados.all(),
        marcarEstado: (steam64Id, estado) => q.estado.run(estado, steam64Id),
        marcarRecolha: (steam64Id, quando) => q.recolha.run(quando, steam64Id),
        marcarPerfilRecolhido: (steam64Id, quando) => q.perfilRecolhido.run(quando, steam64Id),
        guardarPartida,
        contarPartidas: () => q.contarPartidas.get().n,
        partidasDe,
        perfil: (steam64Id) => q.perfil.get(steam64Id),
        guardarPerfil(steam64Id, perfil) {
            q.guardarPerfil.run({
                steam64Id,
                aim: perfil.rating?.aim ?? null,
                utility: perfil.rating?.utility ?? null,
                positioning: perfil.rating?.positioning ?? null,
                premier: perfil.ranks?.premier ?? null,
                faceit: perfil.ranks?.faceit ?? null,
                faceitElo: perfil.ranks?.faceit_elo ?? null,
                clutch: perfil.rating?.clutch ?? null,
                opening: perfil.rating?.opening ?? null,
                agora: new Date().toISOString(),
            });
        },
        servidor(guildId) {
            const g = q.servidor.get(guildId);
            return {
                reportChannelId: g?.report_channel_id ?? null,
                language: g?.language ?? 'pt',
                reportEnabled: g ? g.report_enabled === 1 : true,
                // When the server was first set up (no report for months before that)
                configuredAt: g?.configured_at ?? null,
            };
        },
        guardarServidor(guildId, cfg, agora = new Date()) {
            q.guardarServidor.run({
                guildId,
                reportChannelId: cfg.reportChannelId ?? null,
                language: cfg.language,
                reportEnabled: cfg.reportEnabled ? 1 : 0,
                agora: agora.toISOString(),
            });
        },
        relatorioEnviado: (guildId, mes) => Boolean(q.relatorio.get(guildId, mes)),
        marcarRelatorio: (guildId, mes) => q.marcarRelatorio.run(guildId, mes, new Date().toISOString()),
        pedidosHoje: (dia) => q.pedidos.get(dia)?.requests ?? 0,
        contarPedido: (dia) => q.contarPedido.run(dia),
        /** One snapshot per Lisbon day of a player's Premier rating and FACEIT ELO (the last one of the day wins). */
        guardarRank(steam64Id, quando, { premier = null, faceitElo = null }) {
            q.guardarRank.run({ steam64Id, dia: agoraLisboa(new Date(quando)).data, em: quando, premier, faceitElo });
        },
        ranksEntre,
    };
}

module.exports = { abrirBD };
