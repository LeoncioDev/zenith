/**
 * coingecko.js
 * Cliente HTTP para a CoinGecko API v3.
 *
 * Funcionalidades:
 * - Cache em memória com TTL por endpoint
 * - Cache stale como fallback (serve dados antigos se a API falhar)
 * - Retry automático com backoff exponencial em caso de timeout
 * - Timeout reduzido (8s) para não travar o usuário esperando
 *
 * Por que cache em memória em vez de banco de dados?
 * O Zenith é um dashboard em tempo real — os dados mudam constantemente.
 * Cache curto (60s) evita rate limit da CoinGecko sem dados desatualizados.
 * Cache stale garante que o app continue funcionando mesmo com a API fora.
 */

import fetch from 'node-fetch';

const BASE_URL = 'https://api.coingecko.com/api/v3';

// Cache em memória: Map<chave, { timestamp: number, data: any }>
const _cache = new Map();

// Configurações de retry
const MAX_RETRIES       = 2;
const RETRY_DELAYS      = [2000, 4000]; // ms entre tentativas (backoff exponencial)
const REQUEST_TIMEOUT_MS = 8000;        // aborta requisições que demoram mais de 8s

// ── Funções internas de cache ────────────────────────────────────────────────

/**
 * Retorna dados do cache se ainda estiverem dentro do TTL.
 *
 * @param {string} key        - Chave do cache
 * @param {number} ttlSeconds - Tempo de vida em segundos
 * @returns {any|null} Dados em cache ou null se expirado/inexistente
 */
function _getCached(key, ttlSeconds) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if ((Date.now() - entry.timestamp) / 1000 < ttlSeconds) return entry.data;
  return null; // expirado
}

/**
 * Retorna dados do cache mesmo que expirados (stale).
 * Usado como fallback quando a API está fora.
 *
 * @param {string} key - Chave do cache
 * @returns {any|null} Dados stale ou null se não existirem
 */
function _getStale(key) {
  return _cache.get(key)?.data ?? null;
}

/**
 * Salva dados no cache com timestamp atual.
 *
 * @param {string} key  - Chave do cache
 * @param {any}    data - Dados a salvar
 */
function _setCache(key, data) {
  _cache.set(key, { timestamp: Date.now(), data });
}

// ── Função base de requisição ────────────────────────────────────────────────

/**
 * Faz uma requisição GET com retry, timeout e fallback para cache stale.
 *
 * Estratégia de retry:
 * - Timeout → tenta novamente com delay crescente
 * - Rate limit (429) → aguarda e tenta novamente
 * - Erro HTTP → falha imediata (sem retry)
 *
 * @param {string} url       - URL completa da API
 * @param {object} params    - Query params (objeto chave-valor)
 * @param {string} cacheKey  - Chave para buscar cache stale em caso de falha
 * @returns {any} Dados da API ou cache stale
 * @throws {Error} Se todas as tentativas falharem e não houver cache stale
 */
async function _get(url, params = {}, cacheKey = '') {
  const qs      = new URLSearchParams(params).toString();
  const fullUrl = qs ? `${url}?${qs}` : url;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // AbortController permite cancelar a requisição após o timeout
      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const resp = await fetch(fullUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (resp.status === 429) {
        // Rate limit da CoinGecko — aguarda antes de tentar novamente
        const wait = RETRY_DELAYS[attempt] ?? 5000;
        console.warn(`[CoinGecko] Rate limit. Aguardando ${wait / 1000}s...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      return await resp.json();

    } catch (err) {
      const isTimeout = err.name === 'AbortError';
      const wait      = RETRY_DELAYS[attempt] ?? 5000;
      lastError       = isTimeout ? 'timeout' : err.message;

      if (isTimeout) {
        // Timeout — vale tentar novamente
        console.warn(`[CoinGecko] Timeout (tentativa ${attempt + 1}/${MAX_RETRIES}). Aguardando ${wait / 1000}s...`);
      } else {
        // Erro HTTP ou de rede — não adianta tentar novamente
        console.error(`[CoinGecko] Erro: ${err.message}`);
        break;
      }

      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }

  // Todas as tentativas falharam — serve cache stale se disponível
  if (cacheKey) {
    const stale = _getStale(cacheKey);
    if (stale !== null) {
      console.warn(`[CoinGecko] Servindo cache stale para '${cacheKey}' após falha: ${lastError}`);
      return stale;
    }
  }

  throw new Error(`CoinGecko indisponível: ${lastError}`);
}

// ── Endpoints exportados ─────────────────────────────────────────────────────

/**
 * Lista de moedas com dados de mercado, sparklines e variações percentuais.
 * Chamado pelo frontend a cada 60 segundos via setInterval.
 * Cache: 60 segundos.
 *
 * @param {string} vsCurrency - Moeda de referência ("usd", "brl", etc)
 * @param {number} perPage    - Quantidade de moedas (máx. 250)
 * @returns {Array} Array de objetos com dados de cada moeda
 */
export async function getMarkets(vsCurrency = 'usd', perPage = 50) {
  const key    = `markets_${vsCurrency}_${perPage}`;
  const cached = _getCached(key, 60);
  if (cached) return cached;

  const data = await _get(`${BASE_URL}/coins/markets`, {
    vs_currency:              vsCurrency,
    order:                    'market_cap_desc',
    per_page:                 perPage,
    page:                     1,
    sparkline:                true,               // inclui dados para o mini-gráfico
    price_change_percentage:  '1h,24h,7d',        // variações nos cards e tabela
  }, key);

  _setCache(key, data);
  return data;
}

/**
 * Dados globais do mercado de criptomoedas.
 * Inclui market cap total, volume 24h e dominância BTC/ETH.
 * Cache: 60 segundos.
 *
 * @returns {object} Dados globais do mercado
 */
export async function getGlobal() {
  const key    = 'global';
  const cached = _getCached(key, 60);
  if (cached) return cached;

  const data   = await _get(`${BASE_URL}/global`, {}, key);
  const result = data?.data ?? {}; // a API envolve os dados em { data: {...} }
  _setCache(key, result);
  return result;
}

/**
 * Dados OHLC (Open, High, Low, Close) para o gráfico de velas.
 * O TTL varia: dados do dia têm cache de 60s, dados históricos de 5min.
 * Cache: 60s (1 dia) ou 300s (períodos maiores).
 *
 * @param {string} coinId     - ID da moeda no CoinGecko (ex: "bitcoin")
 * @param {string} vsCurrency - Moeda de referência
 * @param {number} days       - Período (1, 7, 14, 30, 90, 180, 365)
 * @returns {Array} Array de [timestamp, open, high, low, close]
 */
export async function getOhlc(coinId, vsCurrency = 'usd', days = 1) {
  const key    = `ohlc_${coinId}_${vsCurrency}_${days}`;
  const ttl    = days === 1 ? 60 : 300; // dados do dia atualizam mais rápido
  const cached = _getCached(key, ttl);
  if (cached) return cached;

  const data = await _get(
    `${BASE_URL}/coins/${coinId}/ohlc`,
    { vs_currency: vsCurrency, days },
    key,
  );

  _setCache(key, data);
  return data;
}

/**
 * Fear & Greed Index da alternative.me.
 * Índice de 0 (medo extremo) a 100 (ganância extrema) que mede
 * o sentimento geral do mercado de criptomoedas.
 * Cache: 1 hora — o índice é calculado uma vez por dia.
 *
 * @returns {{ value: number, label: string }}
 */
export async function getFearGreed() {
  const key    = 'fear_greed';
  const cached = _getCached(key, 3600);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    // API externa (não é CoinGecko) — tratada separadamente
    const resp = await fetch('https://api.alternative.me/fng/?limit=1', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const raw    = (await resp.json())?.data?.[0] ?? {};
    const result = {
      value: parseInt(raw.value ?? 0, 10),
      label: raw.value_classification ?? 'Unknown',
    };

    _setCache(key, result);
    return result;

  } catch (err) {
    // Fear & Greed tem cache de 1h — dados de horas atrás ainda são úteis
    const stale = _getStale(key);
    if (stale) {
      console.warn(`[Fear & Greed] Servindo cache stale após erro: ${err.message}`);
      return stale;
    }
    throw err;
  }
}
