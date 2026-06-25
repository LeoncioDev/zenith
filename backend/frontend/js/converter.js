/**
 * converter.js — Conversor de moedas em tempo real
 *
 * Permite converter entre USD e as principais criptomoedas usando
 * os preços ao vivo recebidos via WebSocket.
 *
 * Como funciona:
 * - Os preços são armazenados em USD (preço de cada cripto em dólares)
 * - Para converter A → B: amount * (priceA / priceB)
 * - Reconverte automaticamente a cada tick do WebSocket
 * - Suporta troca rápida de moedas com o botão de seta
 */

const Converter = (() => {
  // Cache de preços em USD para cada moeda suportada
  // Inicializado com USD = 1 (referência base)
  const prices = {
    usd: 1,   // sempre 1 — é a moeda de referência
    btc: null, // preenchido pelo WebSocket
    eth: null,
    bnb: null,
    sol: null,
    xrp: null,
  };

  // Mapa do símbolo WebSocket (maiúsculo) para a chave do objeto prices
  const WS_MAP = {
    BTC: 'btc', ETH: 'eth', BNB: 'bnb',
    SOL: 'sol', XRP: 'xrp',
  };

  /**
   * Formata o resultado da conversão com precisão adaptativa.
   * Moedas pequenas (como XRP) precisam de mais casas decimais.
   *
   * @param {number} v        - Valor a formatar
   * @param {string} currency - Moeda de destino (chave do objeto prices)
   * @returns {string} Valor formatado com símbolo
   */
  function fmtResult(v, currency) {
    if (v == null || isNaN(v)) return '—';
    if (currency === 'usd') {
      return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (v >= 1)      return v.toFixed(4) + ' ' + currency.toUpperCase();
    if (v >= 0.0001) return v.toFixed(6) + ' ' + currency.toUpperCase();
    return v.toFixed(8) + ' ' + currency.toUpperCase();
  }

  /**
   * Formata a taxa de câmbio exibida abaixo do resultado.
   * Ex: "1 BTC = $64,179.30" ou "1 BTC = 35.2 ETH"
   *
   * @param {string} from - Moeda de origem
   * @param {string} to   - Moeda de destino
   * @returns {string} Taxa formatada ou "—" se preços indisponíveis
   */
  function fmtRate(from, to) {
    const fromPrice = prices[from];
    const toPrice   = prices[to];
    if (!fromPrice || !toPrice) return '—';

    const rate = fromPrice / toPrice;

    if (to === 'usd') {
      return `1 ${from.toUpperCase()} = $${fromPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    }
    if (rate >= 1) {
      return `1 ${from.toUpperCase()} = ${rate.toFixed(4)} ${to.toUpperCase()}`;
    }
    return `1 ${from.toUpperCase()} = ${rate.toFixed(8)} ${to.toUpperCase()}`;
  }

  /**
   * Realiza e exibe a conversão atual.
   * Chamado em cada mudança de input, de moeda selecionada,
   * ou de preço recebido pelo WebSocket.
   */
  function convert() {
    const input  = document.getElementById('converterInput');
    const from   = document.getElementById('converterFrom')?.value;
    const to     = document.getElementById('converterTo')?.value;
    const result = document.getElementById('converterResult');
    const rate   = document.getElementById('converterRate');

    if (!input || !from || !to || !result) return;

    const amount = parseFloat(input.value);

    // Sem valor válido — limpa o resultado mas mantém a taxa
    if (!amount || isNaN(amount)) {
      result.textContent = '—';
      if (rate) rate.textContent = fmtRate(from, to);
      return;
    }

    const fromPrice = prices[from];
    const toPrice   = prices[to];

    // Aguarda os preços chegarem via WebSocket
    if (!fromPrice || !toPrice) {
      result.textContent = 'Aguardando preços...';
      return;
    }

    // Fórmula de conversão: amount × (preço da origem / preço do destino)
    // Ex: 1 BTC → ETH = 1 × (64179 / 3500) = 18.34 ETH
    const converted        = amount * (fromPrice / toPrice);
    result.textContent     = fmtResult(converted, to);
    if (rate) rate.textContent = fmtRate(from, to);
  }

  /**
   * Atualiza o preço de uma moeda e reconverte em tempo real.
   * Chamado pelo app.js a cada tick do WebSocket.
   *
   * @param {object} ticker - { symbol, price } do WebSocket
   */
  function updatePrice(ticker) {
    const key = WS_MAP[ticker.symbol];
    if (key) {
      prices[key] = ticker.price;
      convert(); // reconverte imediatamente com o novo preço
    }
  }

  /**
   * Troca as moedas de origem e destino e reconverte.
   * Chamado pelo clique na seta ⇅ entre os selects.
   */
  function swapCurrencies() {
    const from = document.getElementById('converterFrom');
    const to   = document.getElementById('converterTo');
    if (!from || !to) return;

    const tmp  = from.value;
    from.value = to.value;
    to.value   = tmp;
    convert();
  }

  /**
   * Inicializa o conversor registrando os event listeners.
   */
  function init() {
    const input = document.getElementById('converterInput');
    const from  = document.getElementById('converterFrom');
    const to    = document.getElementById('converterTo');
    const arrow = document.querySelector('.converter-arrow');

    // Reconverte em cada digitação ou mudança de seleção
    input?.addEventListener('input', convert);
    from?.addEventListener('change', convert);
    to?.addEventListener('change', convert);
    arrow?.addEventListener('click', swapCurrencies);
  }

  return { init, updatePrice };
})();
