// Client for the Leetify public API (https://api-public-docs.cs-prod.leetify.com).
// Leetify answers 404 "Not Found" both for unknown Steam ids and for private profiles,
// so the two cases can't be told apart.

const API = 'https://api-public.cs-prod.leetify.com';
const TIMEOUT_MS = 15 * 1000;
const ESPERA_429_MS = 10 * 60 * 1000;

class ErroLimite extends Error {
    constructor(esperarMs) {
        super(`Leetify rate limit, waiting ${Math.round(esperarMs / 1000)}s`);
        this.esperarMs = esperarMs;
    }
}

class ErroOrcamento extends Error {
    constructor() {
        super('Daily Leetify request budget reached');
    }
}

class ErroPerfil extends Error {
    constructor(estado) {
        super('Leetify profile not found or private');
        this.estado = estado;
    }
}

const valor = (v) => (typeof v === 'function' ? v() : v);

/**
 * `chave` and `orcamento` can be values or functions (so changes on the setup page apply right away).
 * `hoje()` returns today's date in Lisbon ('YYYY-MM-DD'), used to count requests per day.
 */
function criarLeetify({ fetch = globalThis.fetch, chave = null, orcamento = 3000, db, hoje }) {
    async function pedir(caminho) {
        const dia = hoje();
        if (db.pedidosHoje(dia) >= valor(orcamento)) throw new ErroOrcamento();
        db.contarPedido(dia);

        const headers = { Accept: 'application/json' };
        const k = valor(chave);
        if (k) headers._leetify_key = k;
        const res = await fetch(`${API}${caminho}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });

        if (res.status === 429) {
            const segundos = Number(res.headers.get('retry-after'));
            throw new ErroLimite(segundos > 0 ? segundos * 1000 : ESPERA_429_MS);
        }
        if (res.status === 404) throw new ErroPerfil('not_found');
        if (!res.ok) throw new Error(`Leetify ${caminho.split('?')[0]} answered ${res.status}`);
        return res.json();
    }

    return {
        perfil: (steam64Id) => pedir(`/v3/profile?steam64_id=${encodeURIComponent(steam64Id)}`),
        async partidas(steam64Id) {
            const lista = await pedir(`/v3/profile/matches?steam64_id=${encodeURIComponent(steam64Id)}`);
            return lista.map((m) => ({ ...m, stats: (m.stats ?? []).filter((s) => s.steam64_id === steam64Id) }));
        },
    };
}

module.exports = { criarLeetify, ErroLimite, ErroOrcamento, ErroPerfil };
