/**
 * ticker.js — Faixa de preços rolando em tempo real
 *
 * Exibe uma faixa horizontal na parte superior da página com os preços
 * e variações percentuais das principais criptomoedas, atualizando
 * em tempo real via WebSocket sem precisar recriar o DOM.
 *
 * Estratégia de atualização:
 * - Na inicialização: cria placeholders com "—" para todos os símbolos
 * - No snapshot: renderiza a faixa com os dados reais e duplica o HTML
 *   para criar o efeito de loop infinito com CSS animation
 * - Nos ticks subsequentes: atualiza apenas os elementos afetados via
 *   querySelectorAll — sem recriar o DOM inteiro
 */

const Ticker = (() => {
  // Símbolos exibidos na faixa — mesmos monitorados pelo ws-relay.js
  const SYMBOLS = [
    'BTC', 'ETH', 'BNB', 'SOL', 'XRP',
    'ADA', 'DOGE', 'AVAX', 'MATIC', 'LINK',
  ];

  // Cache local com último preço e variação de cada símbolo
  const cache = {};

  /**
   * Constrói o HTML de um item da faixa para um símbolo.
   *
   * @param {string} symbol - Símbolo da moeda (ex: "BTC")
   * @param {object} data   - { price, change_pct }
   * @returns {string} HTML do item
   */
  function buildItem(symbol, data) {
    const isUp = data.change_pct >= 0;
    return `
      <span class="ticker-item" id="tick-${symbol}">
        <span class="ticker-item__symbol">${symbol}</span>
        <span class="ticker-item__price">${fmtPrice(data.price)}</span>
        <span class="ticker-item__change ticker-item__change--${isUp ? 'up' : 'down'}">
          ${isUp ? '▲' : '▼'} ${fmtPct(data.change_pct)}
        </span>
      </span>
      <span class="ticker-sep">·</span>
    `;
  }

  /**
   * Renderiza a faixa completa com os dados em cache.
   * Duplica o HTML para criar o efeito de loop infinito com CSS animation.
   * Chamado uma vez após o snapshot inicial.
   */
  function render() {
    const track = document.getElementById('tickerTrack');
    if (!track) return;

    const items = SYMBOLS
      .filter(sym => cache[sym]) // apenas símbolos com dados
      .map(sym => buildItem(sym, cache[sym]))
      .join('');

    if (!items) return;

    // Duplica o conteúdo — a animação CSS faz o loop contínuo
    track.innerHTML = items + items;
  }

  /**
   * Atualiza o cache e os elementos DOM de um símbolo específico.
   * Chamado a cada tick do WebSocket — eficiente por atualizar só o necessário.
   *
   * @param {object} ticker - { symbol, price, change_pct }
   */
  function update(ticker) {
    const { symbol, price, change_pct } = ticker;
    if (!SYMBOLS.includes(symbol)) return;

    // Atualiza cache local
    cache[symbol] = { price, change_pct };

    // Atualiza todos os elementos do símbolo no DOM
    // (pode haver 2 elementos por símbolo por causa da duplicação do loop)
    document.querySelectorAll(`#tick-${symbol}`).forEach(el => {
      const priceEl  = el.querySelector('.ticker-item__price');
      const changeEl = el.querySelector('.ticker-item__change');
      const isUp     = change_pct >= 0;

      if (priceEl)  priceEl.textContent = fmtPrice(price);
      if (changeEl) {
        changeEl.textContent = `${isUp ? '▲' : '▼'} ${fmtPct(change_pct)}`;
        changeEl.className   = `ticker-item__change ticker-item__change--${isUp ? 'up' : 'down'}`;
      }
    });
  }

  /**
   * Inicializa a faixa com placeholders enquanto aguarda os dados do WebSocket.
   * Evita que a faixa apareça vazia — mostra "—" para todos os símbolos.
   */
  function init() {
    const track = document.getElementById('tickerTrack');
    if (!track) return;

    const placeholders = SYMBOLS.map(sym => `
      <span class="ticker-item ticker-item--loading" id="tick-${sym}">
        <span class="ticker-item__symbol">${sym}</span>
        <span class="ticker-item__price">—</span>
        <span class="ticker-item__change">—</span>
      </span>
      <span class="ticker-sep">·</span>
    `).join('');

    // Duplica para o loop infinito
    track.innerHTML = placeholders + placeholders;
  }

  return { init, update, render };
})();
