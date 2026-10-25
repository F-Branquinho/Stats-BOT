const { test } = require('node:test');
const assert = require('node:assert');
const { agoraLisboa, intervalo, mesAnterior } = require('../src/periodos');

test('agoraLisboa uses Lisbon time (summer: UTC+1)', () => {
    assert.deepStrictEqual(agoraLisboa(new Date('2026-07-31T23:30:00Z')), {
        data: '2026-08-01', mes: '2026-08', dia: 1, hora: 0, minuto: 30,
    });
});

test('agoraLisboa in winter is UTC+0', () => {
    assert.deepStrictEqual(agoraLisboa(new Date('2026-10-31T23:30:00Z')), {
        data: '2026-10-31', mes: '2026-10', dia: 31, hora: 23, minuto: 30,
    });
});

test('intervalo mes after the March DST change: April starts at 23:00 UTC on 31 March', () => {
    const i = intervalo('mes', new Date('2027-04-15T12:00:00Z'));
    assert.deepStrictEqual(i, { desde: '2027-03-31T23:00:00.000Z', ate: '2027-04-30T23:00:00.000Z', mes: '2027-04' });
    assert.ok('2027-03-31T23:30:00.000Z' >= i.desde);
    assert.ok('2027-03-31T22:30:00.000Z' < i.desde);
});

test('intervalo mes at 23:30 UTC on 31 October is still October', () => {
    const i = intervalo('mes', new Date('2026-10-31T23:30:00Z'));
    assert.deepStrictEqual(i, { desde: '2026-09-30T23:00:00.000Z', ate: '2026-11-01T00:00:00.000Z', mes: '2026-10' });
});

test('intervalo mes_passado in January is last December', () => {
    const i = intervalo('mes_passado', new Date('2027-01-05T10:00:00Z'));
    assert.deepStrictEqual(i, { desde: '2026-12-01T00:00:00.000Z', ate: '2027-01-01T00:00:00.000Z', mes: '2026-12' });
});

test('intervalo sempre has no bounds', () => {
    assert.deepStrictEqual(intervalo('sempre', new Date()), { desde: null, ate: null, mes: null });
});

test('mesAnterior', () => {
    assert.strictEqual(mesAnterior('2027-01'), '2026-12');
    assert.strictEqual(mesAnterior('2026-11'), '2026-10');
});
