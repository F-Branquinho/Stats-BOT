// Client for the Leetify public API (https://api-public-docs.cs-prod.leetify.com).
// The public API answers 404 "Not Found" both for unknown Steam ids and for private profiles;
// miniPerfil() uses the website's API to tell them apart.

const API = 'https://api-public.cs-prod.leetify.com';
// Used by the Leetify website; tells private profiles apart from missing ones
const API_SITE = 'https://api.cs-prod.leetify.com';
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

    /**
     * Whether a Steam account has a Leetify account and public stats, from the mini-profile the
     * Leetify website uses. Not an official API: any unexpected answer gives null.
     * @returns {Promise<{ existe: boolean, publico: boolean, nome: string | null } | null>}
     */
    async function miniPerfil(steam64Id) {
        try {
            const dia = hoje();
            if (db.pedidosHoje(dia) >= valor(orcamento)) return null;
            db.contarPedido(dia);
            const res = await fetch(`${API_SITE}/api/mini-profiles/${encodeURIComponent(steam64Id)}`, {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            if (res.status === 404) return { existe: false, publico: false, nome: null };
            if (!res.ok) return null;
            const corpo = await res.json();
            if (!corpo || typeof corpo !== 'object') return null;
            return { existe: true, publico: corpo.isSensitiveDataVisible === true, nome: corpo.name ?? null };
        } catch {
            return null;
        }
    }

    return {
        miniPerfil,
        perfil: (steam64Id) => pedir(`/v3/profile?steam64_id=${encodeURIComponent(steam64Id)}`),
        async partidas(steam64Id) {
            const lista = await pedir(`/v3/profile/matches?steam64_id=${encodeURIComponent(steam64Id)}`);
            return lista.map((m) => ({ ...m, stats: (m.stats ?? []).filter((s) => s.steam64_id === steam64Id) }));
        },
    };
}

module.exports = { criarLeetify, ErroLimite, ErroOrcamento, ErroPerfil };
