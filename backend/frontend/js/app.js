// @ts-nocheck
/**
 * app.js — Ponto de entrada e orquestração do Zenith
 *
 * Responsável por inicializar todos os módulos na ordem correta
 * e conectar os eventos do WebSocket com as atualizações de UI.
 *
 * Ordem de inicialização:
 * 1. ThemeManager — aplica o tema salvo antes de renderizar qualquer coisa
 * 2. Ticker        — prepara a faixa de preços com placeholders
 * 3. Charts        — inicializa os gráficos vazios (candlestick, volume, donut)
 * 4. Converter     — inicializa o conversor de moedas
 * 5. Market        — carrega dados REST do CoinGecko e inicializa a tabela
 * 6. WS.connect()  — abre a conexão WebSocket com o backend relay
 *
 * Fluxo de dados após conexão:
 * Binance → backend relay → WS → snapshot/ticker → módulos atualizam a UI
 */

document.addEventListener('DOMContentLoaded', () => {

  // Inicializa todos os módulos
  ThemeManager.init();
  Ticker.init();
  Charts.init();
  Converter.init();

  const market = Market.init(); // Market.init() retorna { updatePrice }

  // Abre conexão WebSocket com o backend (/ws/prices)
  WS.connect();

  /**
   * Evento 'snapshot' — recebido imediatamente após conectar ao WebSocket.
   * Contém os dados mais recentes de todos os símbolos em cache no servidor.
   * Preenche a UI sem precisar esperar o próximo tick da Binance.
   */
  WS.on('snapshot', (data) => {
    Object.values(data).forEach(ticker => {
      market.updatePrice(ticker);   // atualiza preços nos cards e tabela
      Ticker.update(ticker);        // atualiza faixa de preços rolando
      Converter.updatePrice(ticker); // atualiza preços no conversor
    });

    // Renderiza a faixa após receber todos os dados do snapshot
    Ticker.render();

    // Atualiza o título da aba com o preço do BTC
    if (data.BTC) DynamicTitle.update(data.BTC.price);
  });

  /**
   * Evento 'ticker' — recebido a cada ~1 segundo para cada símbolo.
   * Atualiza a UI com o preço mais recente sem recarregar a página.
   */
  WS.on('ticker', (ticker) => {
    market.updatePrice(ticker);    // flash de cor no preço (verde/vermelho)
    Ticker.update(ticker);         // atualiza o item da faixa rolando
    Converter.updatePrice(ticker); // reconverte em tempo real

    // Atualiza o título da aba apenas para o BTC (moeda principal)
    if (ticker.symbol === 'BTC') DynamicTitle.update(ticker.price);
  });

});