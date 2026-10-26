const { relatoriosPendentes } = require('./scheduler');
const { agoraLisboa, mesAnterior, intervaloDoMes } = require('./periodos');
const { tabelaEntre } = require('./leaderboard');
const { escolherVencedores, mensagemRelatorio } = require('./report');

/** Posts last month's report in every server that still needs it. */
async function enviarRelatorios({ client, db, agora = new Date() }) {
    const mes = mesAnterior(agoraLisboa(agora).mes);
    for (const guildId of relatoriosPendentes(db, [...client.guilds.cache.keys()], agora)) {
        const guild = client.guilds.cache.get(guildId);
        const cfg = db.servidor(guildId);
        try {
            const jogadores = db.jogadoresLigados();
            const discordDe = new Map(jogadores.map((j) => [j.steam64_id, j.discord_id]));
            const { desde, ate } = intervaloDoMes(mes);
            const vencedores = escolherVencedores(tabelaEntre(db, [...discordDe.keys()], desde, ate));
            // Only the players named in the report are pinged
            const mencionados = new Set();
            const mencao = (s) => {
                mencionados.add(discordDe.get(s));
                return `<@${discordDe.get(s)}>`;
            };
            const content = mensagemRelatorio({ vencedores, mes, idioma: cfg.language, mencao });

            const canal = await guild.channels.fetch(cfg.reportChannelId);
            if (!canal) throw new Error(`report channel ${cfg.reportChannelId} not found`);
            await canal.send({ content, allowedMentions: { users: [...mencionados] } });
            db.marcarRelatorio(guildId, mes);
            console.log(`📊 Monthly report for ${mes} sent in ${guild.name}`);
        } catch (error) {
            console.error(`❌ Could not send the ${mes} report in ${guild.name}:`, error.message);
        }
    }
}

module.exports = { enviarRelatorios };
