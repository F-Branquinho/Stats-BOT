const { TIMEZONE } = require('./config');

const FORMATO = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

const doisDigitos = (n) => String(n).padStart(2, '0');

/** Date and time in Lisbon. */
function agoraLisboa(date = new Date()) {
    const p = Object.fromEntries(FORMATO.formatToParts(date).map(({ type, value }) => [type, value]));
    return {
        data: `${p.year}-${p.month}-${p.day}`,
        mes: `${p.year}-${p.month}`,
        dia: Number(p.day),
        hora: Number(p.hour),
        minuto: Number(p.minute),
    };
}

/** The instant (UTC ISO) when month 'YYYY-MM' starts in Lisbon. */
function inicioDoMes(mes) {
    const [ano, m] = mes.split('-').map(Number);
    const meiaNoiteUtc = Date.UTC(ano, m - 1, 1);
    // Lisbon's offset at that moment (DST never changes at midnight on the 1st)
    const local = agoraLisboa(new Date(meiaNoiteUtc));
    const [la, lm, ld] = local.data.split('-').map(Number);
    const offset = Date.UTC(la, lm - 1, ld, local.hora, local.minuto) - meiaNoiteUtc;
    return new Date(meiaNoiteUtc - offset).toISOString();
}

function mesSeguinte(mes) {
    const [ano, m] = mes.split('-').map(Number);
    return m === 12 ? `${ano + 1}-01` : `${ano}-${doisDigitos(m + 1)}`;
}

function mesAnterior(mes) {
    const [ano, m] = mes.split('-').map(Number);
    return m === 1 ? `${ano - 1}-12` : `${ano}-${doisDigitos(m - 1)}`;
}

/** Bounds [desde, ate) of a period: 'mes' (this month), 'mes_passado' or 'sempre'. */
function intervalo(periodo, agora = new Date()) {
    if (periodo === 'sempre') return { desde: null, ate: null, mes: null };
    const atual = agoraLisboa(agora).mes;
    const mes = periodo === 'mes_passado' ? mesAnterior(atual) : atual;
    return { desde: inicioDoMes(mes), ate: inicioDoMes(mesSeguinte(mes)), mes };
}

function intervaloDoMes(mes) {
    return { desde: inicioDoMes(mes), ate: inicioDoMes(mesSeguinte(mes)), mes };
}

module.exports = { agoraLisboa, intervalo, intervaloDoMes, mesAnterior, mesSeguinte };
