/**
 * server.js — Zenith API
 * Servidor principal do backend. Usa Node.js + Express + WebSocket.
 *
 * Responsabilidades:
 * - Servir os arquivos estáticos do frontend (HTML, CSS, JS)
 * - Expor as rotas REST da API (dados do CoinGecko)
 * - Gerenciar conexões WebSocket com os clientes frontend
 * - Iniciar o relay da Binance que transmite preços em tempo real
 *
 * Rotas disponíveis:
 *   GET  /                  → index.html (página principal)
 *   GET  /favicon.svg       → ícone do site
 *   GET  /api/markets       → lista de moedas com dados de mercado
 *   GET  /api/global        → dados globais (market cap, dominância)
 *   GET  /api/ohlc/:coinId  → dados OHLC para o gráfico de velas
 *   GET  /api/fear-greed    → Fear & Greed Index
 *   GET  /api/status        → health check do servidor
 *   WS   /ws/prices         → stream de preços ao vivo (Binance relay)
 */
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import cors from 'cors';
import { relay } from './ws-relay.js';
import * as coingecko from './coingecko.js';

// Em módulos ES, __dirname não existe — reconstruímos manualmente
const __dirname    = dirname(fileURLToPath(import.meta.url));

// Caminho absoluto para a pasta do frontend (dentro do próprio backend no deploy)
const FRONTEND_DIR = join(__dirname, 'frontend');

const PORT         = process.env.PORT || 8000;

// ── App Express ──────────────────────────────────────────────────────────────

const app = express();

// Permite requisições de outras origens (útil durante desenvolvimento)
app.use(cors());
app.use(express.json());

// Serve os arquivos estáticos do frontend com prefixo /static/
// O HTML referencia assets assim: src="/static/js/app.js"
app.use('/static', express.static(FRONTEND_DIR));

// ── Rotas HTML ───────────────────────────────────────────────────────────────

/** Página principal */
app.get('/', (req, res) => {
  res.sendFile(join(FRONTEND_DIR, 'index.html'));
});

/** Favicon — referenciado diretamente pelo HTML */
app.get('/favicon.svg', (req, res) => {
  res.sendFile(join(FRONTEND_DIR, 'favicon.svg'));
});

// ── Rotas API ────────────────────────────────────────────────────────────────

/**
 * GET /api/markets
 * Retorna lista de moedas com preços, variações, market cap e sparklines.
 * Dados vêm do CoinGecko com cache de 60 segundos.
 *
 * Query params:
 *   vs_currency (string) — moeda de referência, padrão "usd"
 *   per_page    (number) — quantidade de moedas, padrão 50
 */
app.get('/api/markets', async (req, res) => {
  try {
    const { vs_currency = 'usd', per_page = 50 } = req.query;
    const data = await coingecko.getMarkets(vs_currency, parseInt(per_page));
    res.json(data);
  } catch (err) {
    console.error('[/api/markets]', err.message);
    res.status(503).json({ detail: 'CoinGecko indisponível.' });
  }
});

/**
 * GET /api/global
 * Retorna dados globais do mercado: market cap total, volume 24h,
 * dominância BTC/ETH e número de criptomoedas ativas.
 * Cache de 60 segundos.
 */
app.get('/api/global', async (req, res) => {
  try {
    const data = await coingecko.getGlobal();
    res.json(data);
  } catch (err) {
    console.error('[/api/global]', err.message);
    res.status(503).json({ detail: 'CoinGecko indisponível.' });
  }
});

/**
 * GET /api/ohlc/:coinId
 * Retorna dados OHLC (Open, High, Low, Close) para o gráfico de velas.
 *
 * Params:
 *   coinId      (string) — ID da moeda no CoinGecko (ex: "bitcoin")
 *
 * Query params:
 *   vs_currency (string) — moeda de referência, padrão "usd"
 *   days        (number) — período em dias (1, 7, 30, 90), padrão 1
 */
app.get('/api/ohlc/:coinId', async (req, res) => {
  try {
    const { coinId } = req.params;
    const { vs_currency = 'usd', days = 1 } = req.query;
    const data = await coingecko.getOhlc(coinId, vs_currency, parseInt(days));
    res.json(data);
  } catch (err) {
    console.error(`[/api/ohlc/${req.params.coinId}]`, err.message);
    res.status(503).json({ detail: 'CoinGecko indisponível.' });
  }
});

/**
 * GET /api/fear-greed
 * Retorna o Fear & Greed Index da alternative.me.
 * Indica o sentimento geral do mercado de 0 (medo extremo) a 100 (ganância extrema).
 * Cache de 1 hora — o índice não muda com frequência.
 */
app.get('/api/fear-greed', async (req, res) => {
  try {
    const data = await coingecko.getFearGreed();
    res.json(data);
  } catch (err) {
    console.error('[/api/fear-greed]', err.message);
    res.status(503).json({ detail: 'Fear & Greed indisponível.' });
  }
});

/**
 * GET /api/status
 * Health check do servidor.
 * Retorna status, número de clientes WebSocket conectados e símbolos em cache.
 */
app.get('/api/status', (req, res) => {
  res.json({
    status:        'ok',
    relay_clients: relay.clients.size,
    symbols_cached: Object.keys(relay.latestData),
  });
});

// ── Servidor HTTP + WebSocket ────────────────────────────────────────────────
// O servidor HTTP e o WebSocket compartilham a mesma porta
// O Express lida com requisições HTTP normais
// O WebSocketServer intercepta conexões no path /ws/prices

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/prices' });

wss.on('connection', (ws) => {
  // Registra o novo cliente no relay
  relay.addClient(ws);

  // Envia snapshot imediato com os dados mais recentes já em cache
  // Evita que o frontend fique vazio até o próximo tick da Binance
  if (Object.keys(relay.latestData).length > 0) {
    ws.send(JSON.stringify({
      type: 'snapshot',
      data: relay.latestData,
    }));
  }

  // Remove o cliente quando desconectar ou der erro
  ws.on('close', () => relay.removeClient(ws));
  ws.on('error', () => relay.removeClient(ws));
});

// ── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n🚀 Zenith rodando em http://localhost:${PORT}`);
  console.log(`   Frontend: ${FRONTEND_DIR}`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws/prices\n`);

  // Inicia a conexão com a Binance WebSocket
  relay.run();
  console.log('[Relay] Binance WebSocket iniciado.');
});

// Encerramento gracioso ao pressionar Ctrl+C
// Fecha o relay da Binance e aguarda conexões abertas antes de sair
process.on('SIGINT', () => {
  console.log('\n[Server] Encerrando...');
  relay.stop();
  server.close(() => process.exit(0));
});