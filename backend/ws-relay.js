/**
 * ws-relay.js
 * Conecta ao WebSocket público da Binance e retransmite os dados
 * em tempo real para todos os clientes frontend conectados.
 *
 * Por que um relay em vez de conectar direto do frontend?
 * - O navegador não pode conectar à Binance diretamente por CORS
 * - O relay centraliza a conexão: 1 conexão Binance → N clientes frontend
 * - Mantém os dados mais recentes em cache para novos clientes
 *
 * Fluxo:
 * Binance WS → ws-relay.js → broadcast → frontend (websocket.js)
 */

import { WebSocket } from 'ws';

// Símbolos monitorados — par USDT de cada moeda
const SYMBOLS = [
  'btcusdt', 'ethusdt', 'bnbusdt', 'solusdt', 'xrpusdt',
  'adausdt', 'dogeusdt', 'avaxusdt', 'maticusdt', 'linkusdt',
];

// Stream combinado da Binance — recebe miniTicker de todos os símbolos
// @miniTicker: atualiza a cada 1 segundo por símbolo com preço, variação e volume
const BINANCE_WS_URL =
  'wss://stream.binance.com:9443/stream?streams=' +
  SYMBOLS.map(s => `${s}@miniTicker`).join('/');

// Intervalo de ping para manter a conexão viva
// A Binance fecha conexões inativas após 24h — o ping previne isso
const PING_INTERVAL_MS = 180_000; // 3 minutos

class BinanceRelay {
  constructor() {
    this.clients    = new Set(); // clientes frontend conectados via WebSocket
    this.latestData = {};        // último dado recebido de cada símbolo { BTC: {...}, ETH: {...} }
    this._running        = false;
    this._binanceWs      = null;
    this._pingTimer      = null;
    this._reconnectTimer = null;
  }

  /**
   * Registra um novo cliente frontend.
   * Chamado pelo server.js quando um browser abre /ws/prices.
   *
   * @param {WebSocket} ws - Conexão WebSocket do cliente
   */
  addClient(ws) {
    this.clients.add(ws);
    console.log(`[Relay] Cliente conectado. Total: ${this.clients.size}`);
  }

  /**
   * Remove um cliente frontend (desconectou ou deu erro).
   *
   * @param {WebSocket} ws - Conexão WebSocket do cliente
   */
  removeClient(ws) {
    this.clients.delete(ws);
    console.log(`[Relay] Cliente desconectado. Total: ${this.clients.size}`);
  }

  /**
   * Envia uma mensagem para todos os clientes frontend conectados.
   * Remove automaticamente clientes com conexão morta (readyState !== OPEN).
   *
   * @param {string} message - Mensagem JSON serializada
   */
  async broadcast(message) {
    if (this.clients.size === 0) return;

    const dead = new Set();
    for (const client of this.clients) {
      try {
        if (client.readyState === 1) { // 1 = WebSocket.OPEN
          client.send(message);
        }
      } catch {
        // Cliente com erro — marca para remoção
        dead.add(client);
      }
    }
    // Remove clientes mortos após o loop para não modificar o Set durante iteração
    dead.forEach(d => this.clients.delete(d));
  }

  /**
   * Normaliza o payload miniTicker da Binance para o formato usado pelo frontend.
   *
   * Campos do miniTicker:
   *   c = close price (último preço negociado)
   *   o = open price (preço de abertura das últimas 24h)
   *   h = high (máxima das últimas 24h)
   *   l = low (mínima das últimas 24h)
   *   v = volume em moeda base (ex: quantidade de BTC)
   *   q = volume em moeda cotada (ex: valor em USDT)
   *
   * @param {object} raw - Payload bruto do miniTicker da Binance
   * @returns {object} Ticker normalizado
   */
  _parseMiniTicker(raw) {
    const close     = parseFloat(raw.c);
    const open      = parseFloat(raw.o);
    const changePct = open ? ((close - open) / open) * 100 : 0;

    return {
      symbol:       raw.s.replace('USDT', ''), // "BTCUSDT" → "BTC"
      price:        close,
      open,
      high:         parseFloat(raw.h),
      low:          parseFloat(raw.l),
      change_pct:   Math.round(changePct * 10000) / 10000, // 4 casas decimais
      volume:       parseFloat(raw.v),
      quote_volume: parseFloat(raw.q),
    };
  }

  /**
   * Inicia o loop de ping para manter a conexão Binance ativa.
   * A Binance fecha conexões após 24h sem atividade — o ping previne isso.
   *
   * @param {WebSocket} ws - Conexão com a Binance
   */
  _startPing(ws) {
    this._pingTimer = setInterval(() => {
      if (ws.readyState === 1) {
        ws.ping();
      }
    }, PING_INTERVAL_MS);
  }

  /** Para o loop de ping e limpa o timer */
  _stopPing() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  /**
   * Inicia o relay — chamado pelo server.js após o servidor subir.
   * Define _running = true e inicia a conexão com a Binance.
   */
  run() {
    this._running = true;
    this._connect();
  }

  /**
   * Abre a conexão WebSocket com a Binance e registra os handlers.
   * Em caso de fechamento, reconecta automaticamente após 3 segundos.
   */
  _connect() {
    if (!this._running) return;

    console.log('[Relay] Conectando à Binance WebSocket...');
    const ws = new WebSocket(BINANCE_WS_URL);
    this._binanceWs = ws;

    ws.on('open', () => {
      console.log('[Relay] Conexão estabelecida com a Binance.');
      this._startPing(ws);
    });

    ws.on('message', (rawMessage) => {
      try {
        const data      = JSON.parse(rawMessage.toString());
        const tickerRaw = data?.data;

        // Filtra apenas eventos miniTicker — ignora outros tipos
        if (!tickerRaw || tickerRaw.e !== '24hrMiniTicker') return;

        const ticker = this._parseMiniTicker(tickerRaw);

        // Atualiza o cache local — usado para o snapshot de novos clientes
        this.latestData[ticker.symbol] = ticker;

        // Transmite para todos os clientes frontend conectados
        this.broadcast(JSON.stringify({ type: 'ticker', data: ticker }));

      } catch (e) {
        console.warn('[Relay] Erro ao parsear mensagem:', e.message);
      }
    });

    ws.on('close', () => {
      console.warn('[Relay] Conexão com Binance fechada. Reconectando em 3s...');
      this._stopPing();
      // Reconecta apenas se o relay não foi parado intencionalmente
      if (this._running) {
        this._reconnectTimer = setTimeout(() => this._connect(), 3000);
      }
    });

    ws.on('error', (err) => {
      console.error('[Relay] Erro na conexão Binance:', err.message);
      // Termina a conexão com erro — o handler 'close' cuidará da reconexão
      ws.terminate();
    });
  }

  /**
   * Para o relay completamente.
   * Chamado pelo server.js no encerramento gracioso (SIGINT).
   */
  stop() {
    this._running = false;
    this._stopPing();
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    if (this._binanceWs)      this._binanceWs.terminate();
  }
}

// Singleton exportado — o server.js importa e usa esta instância
export const relay = new BinanceRelay();
