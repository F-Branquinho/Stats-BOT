const { test } = require('node:test');
const assert = require('node:assert');
// Servers set up long before the months these tests look at
const CONFIGURADO = new Date('2026-01-01T00:00:00Z');
const { abrirBD } = require('../src/db');
const { HORARIOS, emJanela, relatoriosPendentes, tick } = require('../src/scheduler');

test('25 collection slots from 16:00 to 04:00', () => {
    assert.strictEqual(HORARIOS.length, 25);
    assert.strictEqual(HORARIOS[0], '16:00');
    assert.strictEqual(HORARIOS.at(-1), '04:00');
    assert.ok(HORARIOS.includes('00:00'));
    assert.ok(HORARIOS.includes('23:30'));
    assert.ok(!HORARIOS.includes('04:30'));
    assert.ok(!HORARIOS.includes('15:30'));
});

test('emJanela matches slots only', () => {
    assert.strictEqual(emJanela({ hora: 16, minuto: 0 }), true);
    assert.strictEqual(emJanela({ hora: 2, minuto: 30 }), true);
    assert.strictEqual(emJanela({ hora: 12, minuto: 0 }), false);
    assert.strictEqual(emJanela({ hora: 16, minuto: 1 }), false);
});

function servidores() {
    const db = abrirBD(':memory:');
    db.guardarServidor('g1', { reportChannelId: 'c1', language: 'pt', reportEnabled: true }, CONFIGURADO);
    db.guardarServidor('sem-canal', { reportChannelId: null, language: 'pt', reportEnabled: true }, CONFIGURADO);
    db.guardarServidor('desligado', { reportChannelId: 'c2', language: 'pt', reportEnabled: false }, CONFIGURADO);
    return db;
}
const IDS = ['g1', 'sem-canal', 'desligado'];

test('relatoriosPendentes: day 1 before 12:00 → none, at 12:00 → guild (Lisbon time)', () => {
    const db = servidores();
    assert.deepStrictEqual(relatoriosPendentes(db, IDS, new Date('2026-11-01T11:59:00Z')), []);
    assert.deepStrictEqual(relatoriosPendentes(db, IDS, new Date('2026-11-01T12:00:00Z')), ['g1']);
    // Summer: 12:00 in Lisbon is 11:00 UTC
    assert.deepStrictEqual(relatoriosPendentes(db, IDS, new Date('2027-07-01T11:00:00Z')), ['g1']);
});

test('relatoriosPendentes: later in the month catches up, unless already sent', () => {
    const db = servidores();
    assert.deepStrictEqual(relatoriosPendentes(db, IDS, new Date('2026-11-03T09:00:00Z')), ['g1']);
    db.marcarRelatorio('g1', '2026-10');
    assert.deepStrictEqual(relatoriosPendentes(db, IDS, new Date('2026-11-03T09:00:00Z')), []);
});

test('relatoriosPendentes: a server set up during this month gets no report for last month', () => {
    const db = abrirBD(':memory:');
    db.guardarServidor('novo', { reportChannelId: 'c1', language: 'pt', reportEnabled: true }, new Date('2026-11-10T20:00:00Z'));
    assert.deepStrictEqual(relatoriosPendentes(db, ['novo'], new Date('2026-11-15T12:00:00Z')), []);
    assert.deepStrictEqual(relatoriosPendentes(db, ['novo'], new Date('2026-12-01T12:00:00Z')), ['novo']);
    // Changing the settings later keeps the original date
    db.guardarServidor('novo', { reportChannelId: 'c2', language: 'en', reportEnabled: true }, new Date('2026-12-05T10:00:00Z'));
    assert.deepStrictEqual(relatoriosPendentes(db, ['novo'], new Date('2026-12-06T12:00:00Z')), ['novo']);
});

function fakes({ pendentes = [] } = {}) {
    const passos = [];
    return {
        passos,
        deps: {
            recolha: { recolherTudo: async () => { passos.push('recolher'); } },
            enviarRelatorios: async () => { passos.push('enviar'); },
            pendentes: () => pendentes,
        },
    };
}

test('tick in a slot collects', async () => {
    const { passos, deps } = fakes();
    await tick({ ...deps, agora: () => new Date('2026-10-22T20:30:00Z') });
    assert.deepStrictEqual(passos, ['recolher']);
});

test('tick outside the window does nothing', async () => {
    const { passos, deps } = fakes();
    await tick({ ...deps, agora: () => new Date('2026-10-22T10:00:00Z') });
    assert.deepStrictEqual(passos, []);
});

test('pending report: final collection first, then send', async () => {
    const { passos, deps } = fakes({ pendentes: ['g1'] });
    await tick({ ...deps, agora: () => new Date('2026-11-01T12:00:00Z') });
    assert.deepStrictEqual(passos, ['recolher', 'enviar']);
});

test('pending report in a slot collects only once', async () => {
    const { passos, deps } = fakes({ pendentes: ['g1'] });
    await tick({ ...deps, agora: () => new Date('2026-11-01T20:00:00Z') });
    assert.deepStrictEqual(passos, ['recolher', 'enviar']);
});

test('a failing collection does not stop the report', async () => {
    const { passos, deps } = fakes({ pendentes: ['g1'] });
    deps.recolha.recolherTudo = async () => { throw new Error('boom'); };
    const erro = console.error;
    console.error = () => {};
    try {
        await tick({ ...deps, agora: () => new Date('2026-11-01T12:00:00Z') });
    } finally {
        console.error = erro;
    }
    assert.deepStrictEqual(passos, ['enviar']);
});
