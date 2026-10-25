const path = require('path');
const config = require('./config');
const settings = require('./settings');
const { abrirBD } = require('./db');
const { criarLeetify } = require('./leetify');
const { criarRecolha } = require('./collector');
const { agoraLisboa } = require('./periodos');
const { iniciarAgendador, relatoriosPendentes } = require('./scheduler');
const { enviarRelatorios } = require('./envio');
const { definirBD } = require('./commands');

process.on('unhandledRejection', (error) => console.error('❌ Unhandled promise rejection:', error));

function arrancar() {
    const db = abrirBD(path.join(config.DATA_DIR, 'stats.db'));
    const leetify = criarLeetify({
        db,
        chave: () => settings.obter().leetifyKey,
        orcamento: () => settings.obter().orcamentoDiario,
        hoje: () => agoraLisboa().data,
    });
    const recolha = criarRecolha({ db, leetify });
    definirBD(db);

    const bot = require('./bot');
    const painel = require('./web/server').iniciarPainel(bot, { db, recolha });

    const servidores = () => [...(bot.estado.cliente?.guilds.cache.keys() ?? [])];
    iniciarAgendador({
        recolha,
        // Reports wait until the bot is connected
        pendentes: () => (bot.estado.cliente?.isReady() ? relatoriosPendentes(db, servidores()) : []),
        enviarRelatorios: () => enviarRelatorios({ client: bot.estado.cliente, db }),
    });

    if (bot.emSetup()) bot.anunciarSetup();
    bot.ligar();

    async function encerrar(sinal) {
        console.log(`👋 ${sinal} received, shutting down...`);
        painel.close();
        await bot.estado.cliente?.destroy();
        db.fechar();
        process.exit(0);
    }
    process.on('SIGTERM', () => encerrar('SIGTERM'));
    process.on('SIGINT', () => encerrar('SIGINT'));
}

arrancar();
