const { test } = require('node:test');
const assert = require('node:assert');
const { abrirBD } = require('../src/db');
const partidas = require('./fixtures/partidas.json');

const premier = partidas[0];
const wingman = partidas.find((m) => m.data_source === 'matchmaking_wingman');

function stats(match, steam64Id) {
    return { ...match.stats[0], steam64_id: steam64Id };
}

test('ligarJogador saves the link and reads it back', () => {
    const db = abrirBD(':memory:');
    assert.deepStrictEqual(db.ligarJogador({ discordId: 'd1', steam64Id: 's1', nome: 'Ana', avatar: null }), { ok: true });
    assert.strictEqual(db.jogador('d1').steam64_id, 's1');
    assert.strictEqual(db.jogadorPorSteam('s1').discord_id, 'd1');
    assert.strictEqual(db.jogador('d1').leetify_status, 'ok');
    assert.strictEqual(db.jogadoresLigados().length, 1);
});

test('steam já ligada: another Discord user cannot take it', () => {
    const db = abrirBD(':memory:');
    db.ligarJogador({ discordId: 'd1', steam64Id: 's1', nome: 'Ana' });
    assert.deepStrictEqual(db.ligarJogador({ discordId: 'd2', steam64Id: 's1', nome: 'Rui' }), { ok: false, motivo: 'steam_ocupada' });
    assert.strictEqual(db.jogadorPorSteam('s1').discord_id, 'd1');
    assert.strictEqual(db.jogador('d2'), undefined);
});

test('linking again with the same Discord user replaces the Steam account', () => {
    const db = abrirBD(':memory:');
    db.ligarJogador({ discordId: 'd1', steam64Id: 's1', nome: 'Ana' });
    db.ligarJogador({ discordId: 'd1', steam64Id: 's2', nome: 'Ana' });
    assert.strictEqual(db.jogador('d1').steam64_id, 's2');
    assert.strictEqual(db.jogadoresLigados().length, 1);
});

test('desligarJogador removes the link', () => {
    const db = abrirBD(':memory:');
    db.ligarJogador({ discordId: 'd1', steam64Id: 's1', nome: 'Ana' });
    db.desligarJogador('d1');
    assert.strictEqual(db.jogador('d1'), undefined);
});

test('marcarEstado and marcarRecolha update the player', () => {
    const db = abrirBD(':memory:');
    db.ligarJogador({ discordId: 'd1', steam64Id: 's1', nome: 'Ana' });
    db.marcarEstado('s1', 'not_found');
    db.marcarRecolha('s1', '2026-10-22T16:00:00.000Z');
    assert.strictEqual(db.jogador('d1').leetify_status, 'not_found');
    assert.strictEqual(db.jogador('d1').last_fetched_at, '2026-10-22T16:00:00.000Z');
});

test('mesma partida para dois jogadores: stored once, one row per player, no duplicates', () => {
    const db = abrirBD(':memory:');
    assert.strictEqual(db.guardarPartida(premier, stats(premier, 's1')), true);
    assert.strictEqual(db.guardarPartida(premier, stats(premier, 's2')), true);
    assert.strictEqual(db.guardarPartida(premier, stats(premier, 's1')), false);
    assert.strictEqual(db.guardarPartida(premier, stats(premier, 's2')), false);
    assert.strictEqual(db.contarPartidas(), 1);
    assert.strictEqual(db.partidasDe(['s1', 's2'], null, null).length, 2);
});

test('guardarPartida computes result, rating and points', () => {
    const db = abrirBD(':memory:');
    db.guardarPartida(premier, stats(premier, 's1'));
    const [p] = db.partidasDe(['s1'], null, null);
    assert.strictEqual(p.result, 'V');
    assert.strictEqual(p.hltv_rating, 1.68);
    assert.strictEqual(p.points, 8);
    assert.strictEqual(p.map_name, 'de_dust2');
    assert.strictEqual(p.finished_at, premier.finished_at);
});

test('a match that does not count is stored but left out of partidasDe', () => {
    const db = abrirBD(':memory:');
    assert.strictEqual(db.guardarPartida(wingman, stats(wingman, 's1')), true);
    assert.strictEqual(db.guardarPartida(wingman, stats(wingman, 's1')), false);
    assert.strictEqual(db.partidasDe(['s1'], null, null).length, 0);
});

test('a match without id or finished_at is skipped without throwing', () => {
    const db = abrirBD(':memory:');
    assert.strictEqual(db.guardarPartida({ ...premier, finished_at: undefined }, stats(premier, 's1')), false);
    assert.strictEqual(db.guardarPartida({ ...premier, id: undefined }, stats(premier, 's1')), false);
    assert.strictEqual(db.contarPartidas(), 0);
});

test('a ban flagged after the first fetch stops the match from counting', () => {
    const db = abrirBD(':memory:');
    db.guardarPartida(premier, stats(premier, 's1'));
    db.guardarPartida(premier, stats(premier, 's2'));
    assert.strictEqual(db.partidasDe(['s1', 's2'], null, null).length, 2);
    assert.strictEqual(db.guardarPartida({ ...premier, has_banned_player: true }, stats(premier, 's1')), false);
    assert.strictEqual(db.partidasDe(['s1', 's2'], null, null).length, 0);
    // A later answer without the flag doesn't undo it
    db.guardarPartida({ ...premier, has_banned_player: false }, stats(premier, 's1'));
    db.guardarPartida({ ...premier, has_banned_player: false }, stats(premier, 's3'));
    assert.strictEqual(db.partidasDe(['s1', 's2', 's3'], null, null).length, 0);
});

test('partidasDe filters by date range [desde, ate)', () => {
    const db = abrirBD(':memory:');
    db.guardarPartida(premier, stats(premier, 's1'));
    const t = premier.finished_at;
    assert.strictEqual(db.partidasDe(['s1'], t, null).length, 1);
    assert.strictEqual(db.partidasDe(['s1'], null, t).length, 0);
    assert.strictEqual(db.partidasDe([], null, null).length, 0);
});

test('guardarPerfil keeps the latest Leetify ratings', () => {
    const db = abrirBD(':memory:');
    db.guardarPerfil('s1', { rating: { aim: 80.5, utility: 50, positioning: 60 }, ranks: { premier: 15000, faceit_elo: 1800 } });
    assert.strictEqual(db.perfil('s1').aim, 80.5);
    assert.strictEqual(db.perfil('s1').premier, 15000);
});

test('servidor defaults and guardarServidor', () => {
    const db = abrirBD(':memory:');
    assert.deepStrictEqual(db.servidor('g1'), { reportChannelId: null, language: 'pt', reportEnabled: true, configuredAt: null });
    db.guardarServidor('g1', { reportChannelId: 'c1', language: 'en', reportEnabled: false }, new Date('2026-10-01T00:00:00Z'));
    assert.deepStrictEqual(db.servidor('g1'), { reportChannelId: 'c1', language: 'en', reportEnabled: false, configuredAt: '2026-10-01T00:00:00.000Z' });
});

test('relatorioEnviado / marcarRelatorio per guild and month', () => {
    const db = abrirBD(':memory:');
    assert.strictEqual(db.relatorioEnviado('g1', '2026-10'), false);
    db.marcarRelatorio('g1', '2026-10');
    assert.strictEqual(db.relatorioEnviado('g1', '2026-10'), true);
    assert.strictEqual(db.relatorioEnviado('g1', '2026-11'), false);
    assert.strictEqual(db.relatorioEnviado('g2', '2026-10'), false);
});

test('request counter per day', () => {
    const db = abrirBD(':memory:');
    assert.strictEqual(db.pedidosHoje('2026-10-22'), 0);
    db.contarPedido('2026-10-22');
    db.contarPedido('2026-10-22');
    assert.strictEqual(db.pedidosHoje('2026-10-22'), 2);
    assert.strictEqual(db.pedidosHoje('2026-10-23'), 0);
});

test('ligarJogador with forcar moves a Steam account to another Discord user', () => {
    const db = abrirBD(':memory:');
    db.ligarJogador({ discordId: 'd1', steam64Id: 's1', nome: 'Ana' });
    assert.deepStrictEqual(db.ligarJogador({ discordId: 'd2', steam64Id: 's1', nome: 'Rui', forcar: true }), { ok: true, movidoDe: 'd1' });
    assert.strictEqual(db.jogadorPorSteam('s1').discord_id, 'd2');
    assert.strictEqual(db.jogador('d1'), undefined);
});

test('HE damage is stored as totals (average per HE × HEs thrown)', () => {
    const db = abrirBD(':memory:');
    db.guardarPartida(premier, { ...stats(premier, 's1'), he_thrown: 8, he_foes_damage_avg: 4.75, he_friends_damage_avg: 0.625 });
    const [p] = db.partidasDe(['s1'], null, null);
    assert.strictEqual(p.he_foes_damage, 38);
    assert.strictEqual(p.he_friends_damage, 5);
});

test('an existing database gets the HE columns, and old matches are filled in when seen again', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const ficheiro = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stats-db-')), 'stats.db');
    const antiga = abrirBD(ficheiro);
    antiga.guardarPartida(premier, stats(premier, 's1'));
    // Turn it into a v1 database, from before the HE columns
    antiga.bd.exec('ALTER TABLE player_matches DROP COLUMN he_foes_damage; ALTER TABLE player_matches DROP COLUMN he_friends_damage;');
    antiga.bd.pragma('user_version = 1');
    antiga.fechar();

    const db = abrirBD(ficheiro);
    assert.strictEqual(db.partidasDe(['s1'], null, null)[0].he_foes_damage, null);
    const novo = db.guardarPartida(premier, { ...stats(premier, 's1'), he_thrown: 10, he_foes_damage_avg: 2.4, he_friends_damage_avg: 0 });
    assert.strictEqual(novo, false);
    assert.strictEqual(db.partidasDe(['s1'], null, null)[0].he_foes_damage, 24);
    assert.strictEqual(db.bd.pragma('user_version', { simple: true }), 3);
    db.fechar();
});

const COLUNAS_V3 = ['total_damage', 'flash_duration', 'flash_assist', 'utility_on_death', 'mvps', 'trade_kill_attempts', 'trade_kills_succeed',
    'traded_death_attempts', 'traded_deaths_succeed', 'shots_fired', 'shots_hit_foe', 'spray_accuracy', 'counter_strafing_good', 'counter_strafing_all'];

test('v3 stats are stored: damage, flash duration and assists, unused utility, trades, MVPs, aim details', () => {
    const db = abrirBD(':memory:');
    db.guardarPartida(premier, {
        ...stats(premier, 's1'), total_damage: 2004, flashbang_hit_foe_avg_duration: 3.5, flash_assist: 4, utility_on_death_avg: 52.6,
        mvps: 3, trade_kill_attempts: 7, trade_kills_succeed: 3, traded_death_attempts: 6, traded_deaths_succeed: 2,
        shots_fired: 405, shots_hit_foe: 63, spray_accuracy: 0.35, counter_strafing_shots_good: 51, counter_strafing_shots_all: 63,
    });
    const [p] = db.partidasDe(['s1'], null, null);
    assert.deepStrictEqual(COLUNAS_V3.map((c) => p[c]), [2004, 3.5, 4, 52.6, 3, 7, 3, 6, 2, 405, 63, 0.35, 51, 63]);
});

test('a v2 database gets the v3 columns, filled in when Leetify sends the match again', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const ficheiro = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stats-db-')), 'stats.db');
    const antiga = abrirBD(ficheiro);
    antiga.guardarPartida(premier, stats(premier, 's1'));
    for (const c of COLUNAS_V3) antiga.bd.exec(`ALTER TABLE player_matches DROP COLUMN ${c}`);
    antiga.bd.exec('ALTER TABLE player_profile DROP COLUMN clutch; ALTER TABLE player_profile DROP COLUMN opening;');
    antiga.bd.pragma('user_version = 2');
    antiga.fechar();

    const db = abrirBD(ficheiro);
    assert.strictEqual(db.partidasDe(['s1'], null, null)[0].total_damage, null);
    db.guardarPartida(premier, { ...stats(premier, 's1'), total_damage: 1974, mvps: 2 });
    const [p] = db.partidasDe(['s1'], null, null);
    assert.strictEqual(p.total_damage, 1974);
    assert.strictEqual(p.mvps, 2);
    assert.strictEqual(db.bd.pragma('user_version', { simple: true }), 3);
    db.fechar();
});

test('guardarPerfil also keeps the clutch and opening ratings', () => {
    const db = abrirBD(':memory:');
    db.guardarPerfil('s1', { rating: { aim: 85, clutch: 0.1221, opening: -0.0021 } });
    assert.strictEqual(db.perfil('s1').clutch, 0.1221);
    assert.strictEqual(db.perfil('s1').opening, -0.0021);
});
