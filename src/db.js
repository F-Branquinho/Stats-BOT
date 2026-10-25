const Database = require('better-sqlite3');
const { hltv1, resultado, pontos, partidaConta } = require('./rating');

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
    report_enabled    INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS reports (
    guild_id TEXT NOT NULL,
    month    TEXT NOT NULL,
    sent_at  TEXT NOT NULL,
    PRIMARY KEY (guild_id, month)
);
CREATE TABLE IF NOT EXISTS api_usage (
    day      TEXT PRIMARY KEY,
    requests INTEGER NOT NULL
);
`;

/** Opens (and creates) the database. Use ':memory:' in tests. */
function abrirBD(ficheiro) {
    const db = new Database(ficheiro);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(ESQUEMA);
    db.pragma('user_version = 1');

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
        partida: db.prepare(`INSERT OR IGNORE INTO matches (id, finished_at, map_name, data_source, has_banned_player)
            VALUES (@id, @finished_at, @map_name, @data_source, @has_banned_player)`),
        jogadorPartida: db.prepare(`INSERT OR IGNORE INTO player_matches VALUES (
            @match_id, @steam64_id, @kills, @deaths, @assists, @hs_kills, @rounds, @rounds_won, @rounds_lost,
            @multi1k, @multi2k, @multi3k, @multi4k, @multi5k, @dpr, @leetify_rating, @accuracy_head,
            @shots_fired_enemy_spotted, @shots_hit_enemy_spotted, @preaim, @reaction_time,
            @flash_thrown, @flash_hit_foe, @flash_hit_friend, @flash_leading_to_kill,
            @he_thrown, @smoke_thrown, @molotov_thrown, @result, @hltv_rating, @points, @counted)`),
        contarPartidas: db.prepare('SELECT COUNT(*) AS n FROM matches'),
        perfil: db.prepare('SELECT * FROM player_profile WHERE steam64_id = ?'),
        guardarPerfil: db.prepare(`INSERT INTO player_profile VALUES (@steam64Id, @aim, @utility, @positioning, @premier, @faceitElo, @agora)
            ON CONFLICT (steam64_id) DO UPDATE SET aim = excluded.aim, utility = excluded.utility,
                positioning = excluded.positioning, premier = excluded.premier,
                faceit_elo = excluded.faceit_elo, updated_at = excluded.updated_at`),
        servidor: db.prepare('SELECT * FROM guilds WHERE guild_id = ?'),
        guardarServidor: db.prepare(`INSERT INTO guilds VALUES (@guildId, @reportChannelId, @language, @reportEnabled)
            ON CONFLICT (guild_id) DO UPDATE SET report_channel_id = excluded.report_channel_id,
                language = excluded.language, report_enabled = excluded.report_enabled`),
        relatorio: db.prepare('SELECT 1 FROM reports WHERE guild_id = ? AND month = ?'),
        marcarRelatorio: db.prepare('INSERT OR IGNORE INTO reports VALUES (?, ?, ?)'),
        pedidos: db.prepare('SELECT requests FROM api_usage WHERE day = ?'),
        contarPedido: db.prepare(`INSERT INTO api_usage VALUES (?, 1)
            ON CONFLICT (day) DO UPDATE SET requests = requests + 1`),
    };

    const ligarJogador = db.transaction(({ discordId, steam64Id, nome = null, avatar = null }) => {
        const dono = q.jogadorPorSteam.get(steam64Id);
        if (dono && dono.discord_id !== discordId) return { ok: false, motivo: 'steam_ocupada' };
        q.ligar.run({ discordId, steam64Id, nome, avatar, agora: new Date().toISOString() });
        return { ok: true };
    });

    const guardarPartida = db.transaction((match, s) => {
        const rating = hltv1(s);
        const res = resultado(s);
        q.partida.run({
            id: match.id,
            finished_at: match.finished_at,
            map_name: match.map_name ?? null,
            data_source: match.data_source ?? null,
            has_banned_player: match.has_banned_player ? 1 : 0,
        });
        const info = q.jogadorPartida.run({
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
            counted: partidaConta(match, s) ? 1 : 0,
        });
        return info.changes > 0;
    });

    /** Counted matches of these players, newest first, with finished_at in [desde, ate). */
    function partidasDe(steam64Ids, desde, ate) {
        if (steam64Ids.length === 0) return [];
        const marcas = steam64Ids.map(() => '?').join(', ');
        return db.prepare(`SELECT pm.*, m.finished_at, m.map_name, m.data_source
            FROM player_matches pm JOIN matches m ON m.id = pm.match_id
            WHERE pm.counted = 1 AND pm.steam64_id IN (${marcas})
              AND (? IS NULL OR m.finished_at >= ?) AND (? IS NULL OR m.finished_at < ?)
            ORDER BY m.finished_at DESC`).all(...steam64Ids, desde, desde, ate, ate);
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
                faceitElo: perfil.ranks?.faceit_elo ?? null,
                agora: new Date().toISOString(),
            });
        },
        servidor(guildId) {
            const g = q.servidor.get(guildId);
            return {
                reportChannelId: g?.report_channel_id ?? null,
                language: g?.language ?? 'pt',
                reportEnabled: g ? g.report_enabled === 1 : true,
            };
        },
        guardarServidor(guildId, cfg) {
            q.guardarServidor.run({
                guildId,
                reportChannelId: cfg.reportChannelId ?? null,
                language: cfg.language,
                reportEnabled: cfg.reportEnabled ? 1 : 0,
            });
        },
        relatorioEnviado: (guildId, mes) => Boolean(q.relatorio.get(guildId, mes)),
        marcarRelatorio: (guildId, mes) => q.marcarRelatorio.run(guildId, mes, new Date().toISOString()),
        pedidosHoje: (dia) => q.pedidos.get(dia)?.requests ?? 0,
        contarPedido: (dia) => q.contarPedido.run(dia),
    };
}

module.exports = { abrirBD };
