// "Sign in through Steam" (OpenID 2.0). Steam only tells us the Steam64 id, which is all we need.

const STEAM_LOGIN = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const ID_STEAM = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const CAMINHO_RETORNO = '/link/steam/callback';
const CAMPOS_ASSINADOS = ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce'];

function urlLogin(publicUrl, state) {
    const url = new URL(STEAM_LOGIN);
    url.search = new URLSearchParams({
        'openid.ns': OPENID_NS,
        'openid.mode': 'checkid_setup',
        'openid.return_to': `${publicUrl}${CAMINHO_RETORNO}?state=${encodeURIComponent(state)}`,
        'openid.realm': publicUrl,
        'openid.identity': `${OPENID_NS}/identifier_select`,
        'openid.claimed_id': `${OPENID_NS}/identifier_select`,
    }).toString();
    return url.toString();
}

/**
 * Checks Steam's answer by sending it back to Steam (check_authentication).
 * Returns the Steam64 id, or null when the login was cancelled or doesn't check out.
 */
async function verificar(query, { fetch = globalThis.fetch, publicUrl }) {
    if (query['openid.mode'] !== 'id_res') return null;
    if (query['openid.op_endpoint'] !== STEAM_LOGIN) return null;
    if (!String(query['openid.return_to'] ?? '').startsWith(`${publicUrl}${CAMINHO_RETORNO}`)) return null;
    const id = ID_STEAM.exec(String(query['openid.claimed_id'] ?? ''))?.[1];
    if (!id) return null;
    if (query['openid.identity'] !== query['openid.claimed_id']) return null;
    // The fields we rely on must be covered by Steam's signature
    const assinados = new Set(String(query['openid.signed'] ?? '').split(','));
    if (!CAMPOS_ASSINADOS.every((c) => assinados.has(c))) return null;

    const corpo = new URLSearchParams();
    for (const [chave, valor] of Object.entries(query)) {
        if (chave.startsWith('openid.') && typeof valor === 'string') corpo.set(chave, valor);
    }
    corpo.set('openid.mode', 'check_authentication');
    const res = await fetch(STEAM_LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: corpo.toString(),
        signal: AbortSignal.timeout(15 * 1000),
    });
    if (!res.ok) return null;
    return /^is_valid:true$/m.test(await res.text()) ? id : null;
}

module.exports = { urlLogin, verificar };
