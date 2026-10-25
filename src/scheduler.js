const cron = require('node-cron');
const { TIMEZONE } = require('./config');
const { agoraLisboa, mesAnterior, intervaloDoMes } = require('./periodos');

const HORA_RELATORIO = 12;
const doisDigitos = (n) => String(n).padStart(2, '0');

// Every 30 minutes from 16:00 to 04:00 (Lisbon), when the group plays
const HORARIOS = [];
for (let h = 16; h < 24 + 4; h++) {
    HORARIOS.push(`${doisDigitos(h % 24)}:00`, `${doisDigitos(h % 24)}:30`);
}
HORARIOS.push('04:00');

function emJanela({ hora, minuto }) {
    return HORARIOS.includes(`${doisDigitos(hora)}:${doisDigitos(minuto)}`);
}

/**
 * Servers that still need last month's report: from the 1st at 12:00 (Lisbon) onwards,
 * so a report missed while the bot was down is sent when it's back. Servers set up during
 * this month don't get last month's report.
 */
function relatoriosPendentes(db, guildIds, agora = new Date()) {
    const l = agoraLisboa(agora);
    if (l.dia === 1 && l.hora < HORA_RELATORIO) return [];
    const mes = mesAnterior(l.mes);
    const inicioDoMes = intervaloDoMes(l.mes).desde;
    return guildIds.filter((id) => {
        const cfg = db.servidor(id);
        return cfg.reportEnabled && cfg.reportChannelId && cfg.configuredAt && cfg.configuredAt < inicioDoMes
            && !db.relatorioEnviado(id, mes);
    });
}

/** One scheduler step: collect in the evening window, and send pending reports after a final collection. */
async function tick({ recolha, enviarRelatorios, pendentes, agora = () => new Date() }) {
    let recolheu = false;
    const recolher = async () => {
        recolheu = true;
        try {
            await recolha.recolherTudo();
        } catch (error) {
            console.error('❌ Collection failed:', error);
        }
    };

    if (emJanela(agoraLisboa(agora()))) await recolher();
    if (pendentes().length > 0) {
        if (!recolheu) await recolher();
        try {
            await enviarRelatorios();
        } catch (error) {
            console.error('❌ Sending the monthly reports failed:', error);
        }
    }
}

/** Runs `tick` every 30 minutes and once at startup (to catch up on a missed report). */
function iniciarAgendador(deps) {
    const correr = () => tick(deps);
    cron.schedule('0,30 * * * *', correr, { timezone: TIMEZONE });
    correr();
}

module.exports = { HORARIOS, emJanela, relatoriosPendentes, tick, iniciarAgendador };
