const path = require('path');
require('dotenv').config();

function opcional(nome) {
    return process.env[nome]?.trim() || null;
}

// The bot token, OAuth2 client secret, public address and Leetify key are in settings.js,
// because they can also be set on the setup page.
const config = {
    DATA_DIR: path.resolve(opcional('DATA_DIR') || path.join(__dirname, '..', 'data')),

    // Month boundaries, collection slots and the monthly report all use this timezone
    TIMEZONE: 'Europe/Lisbon',

    // Where the website listens
    WEB_HOST: opcional('WEB_HOST') || '0.0.0.0',
    WEB_PORT: Number(opcional('WEB_PORT') || 3000),
};

if (!Number.isInteger(config.WEB_PORT) || config.WEB_PORT < 1 || config.WEB_PORT > 65535) {
    console.error(`❌ Invalid WEB_PORT: "${process.env.WEB_PORT}"`);
    process.exit(1);
}

module.exports = config;
