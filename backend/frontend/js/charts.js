// @ts-nocheck
/**
 * charts.js — Gráficos do Zenith
 *
 * Módulos:
 *  - Candlestick (OHLC) — gráfico de velas com dados da CoinGecko
 *  - Volume — barras de volume estimado (proxy visual)
 *  - Dominância — donut BTC/ETH/Outros
 *  - Sparkline — mini gráfico nos cards de moeda
 *
 * Correções aplicadas:
 *  - Trata array vazio da CoinGecko (moedas sem dados OHLC)
 *  - Inicializa gráficos com unidade de tempo correta por período
 *  - Remove chamadas duplas de update() que causavam conflito
 *  - Adiciona estado de loading/erro visual no painel do gráfico
 *  - Destrói e recria os gráficos ao trocar de moeda para evitar
 *    problemas de escala quando a unidade de tempo muda
 */

const Charts = (() => {

  let candlestickChart = null;
  let volumeChart      = null;
  let dominanceChart   = null;

  /* ── Helpers de cor ─────────────────────────────────────────
     Lê variáveis CSS do tema ativo via getComputedStyle.
     Chamado antes de cada update para refletir o tema atual.  */
  function getCssVar(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name).trim();
  }

  function getChartColors() {
    return {
      accent:    getCssVar('--accent'),
      up:        getCssVar('--up'),
      down:      getCssVar('--down'),
      border:    getCssVar('--border'),
      text:      getCssVar('--text'),
      textMuted: getCssVar('--text-muted'),
      surface:   getCssVar('--surface'),
    };
  }

  /* ── Unidade de tempo por período ───────────────────────────
     Define a unidade correta para o eixo X baseado no range
     dos dados recebidos. Resolve problema de gráfico em branco
     quando a unidade não bate com os dados.                   */
  function getTimeUnit(dataPoints) {
    if (!dataPoints?.length) return 'hour';
    const range = dataPoints[dataPoints.length - 1].x - dataPoints[0].x;
    const days  = range / (1000 * 60 * 60 * 24);
    if (days <= 2)  return 'hour';
    if (days <= 14) return 'day';
    return 'week';
  }

  /* ── Estado visual do painel de gráfico ─────────────────────
     Exibe loading ou mensagem de erro no painel do candlestick.
     Resolve o problema de gráfico em branco sem feedback.     */
  function setChartState(state, message = '') {
    const panel    = document.querySelector('.panel--chart .panel__body--chart');
    const existing = document.getElementById('chart-overlay');
    if (existing) existing.remove();

    if (state === 'idle') return;

    const overlay = document.createElement('div');
    overlay.id = 'chart-overlay';
    overlay.style.cssText = [
      'position:absolute', 'inset:0', 'display:flex',
      'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.4)', 'border-radius:8px',
      'font-size:13px', 'color:var(--text-muted)',
      'z-index:10', 'pointer-events:none',
      'backdrop-filter:blur(2px)',
    ].join(';');

    overlay.textContent = state === 'loading'
      ? 'Carregando...'
      : message || 'Dados indisponíveis para este período.';

    if (panel) {
      panel.style.position = 'relative';
      panel.appendChild(overlay);
    }
  }

  /* ── Destroi e recria o candlestick ─────────────────────────
     Recriar é mais confiável do que atualizar quando a unidade
     de tempo muda — evita bugs de escala do Chart.js.         */
  function rebuildCandlestick(formatted, c) {
    const ctx = document.getElementById('candlestickChart');
    if (!ctx) return;

    if (candlestickChart) {
      candlestickChart.destroy();
      candlestickChart = null;
    }

    const unit = getTimeUnit(formatted);

    candlestickChart = new Chart(ctx, {
      type: 'candlestick',
      data: {
        datasets: [{
          label: 'OHLC',
          data:  formatted,
          color: { up: c.up, down: c.down, unchanged: c.textMuted },
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation:           { duration: 200 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => {
                const { o, h, l, c } = item.raw;
                const change = ((c - o) / o * 100).toFixed(2);
                const sign   = c >= o ? '▲' : '▼';
                return [
                  `Abertura:   ${fmtPrice(o)}`,
                  `Máximo:     ${fmtPrice(h)}`,
                  `Mínimo:     ${fmtPrice(l)}`,
                  `Fechamento: ${fmtPrice(c)}`,
                  `Variação:   ${sign} ${change}%`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            type: 'time',
            time: { unit },
            grid:  { color: c.border },
            ticks: { color: c.textMuted, maxTicksLimit: 8 },
          },
          y: {
            position: 'right',
            grid:  { color: c.border },
            ticks: { color: c.textMuted, callback: (v) => fmtPrice(v) },
          },
        },
      },
    });
  }

  /* ── Destroi e recria o volume ───────────────────────────── */
  function rebuildVolume(volumeData, volumeColors, c) {
    const ctx = document.getElementById('volumeChart');
    if (!ctx) return;

    if (volumeChart) {
      volumeChart.destroy();
      volumeChart = null;
    }

    const unit = getTimeUnit(volumeData);

    volumeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        datasets: [{
          label:           'Volume',
          data:            volumeData,
          backgroundColor: volumeColors,
          borderColor:     'transparent',
          borderWidth:     0,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation:           { duration: 200 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => `Volume: ${fmtVolume(item.raw.y)}`,
            },
          },
        },
        scales: {
          x: {
            type: 'time',
            time: { unit },
            grid:  { display: false },
            ticks: { display: false },
          },
          y: {
            position: 'right',
            grid:  { color: c.border },
            ticks: {
              color: c.textMuted,
              maxTicksLimit: 3,
              callback: (v) => fmtVolume(v),
            },
          },
        },
      },
    });
  }

  /* ── Candlestick: inicialização vazia ───────────────────────
     Cria o gráfico vazio para ocupar o espaço enquanto os
     dados ainda não chegaram do backend.                      */
  function initCandlestick() {
    const ctx = document.getElementById('candlestickChart');
    if (!ctx) return;
    const c = getChartColors();

    candlestickChart = new Chart(ctx, {
      type: 'candlestick',
      data: { datasets: [{ label: 'OHLC', data: [] }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 0 },
        plugins: { legend: { display: false } },
        scales: {
          x: { type: 'time', time: { unit: 'hour' }, grid: { color: c.border }, ticks: { color: c.textMuted } },
          y: { position: 'right', grid: { color: c.border }, ticks: { color: c.textMuted, callback: v => fmtPrice(v) } },
        },
      },
    });
  }

  /* ── Volume: inicialização vazia ────────────────────────── */
  function initVolume() {
    const ctx = document.getElementById('volumeChart');
    if (!ctx) return;
    const c = getChartColors();

    volumeChart = new Chart(ctx, {
      type: 'bar',
      data: { datasets: [{ label: 'Volume', data: [] }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 0 },
        plugins: { legend: { display: false } },
        scales: {
          x: { type: 'time', time: { unit: 'hour' }, grid: { display: false }, ticks: { display: false } },
          y: { position: 'right', grid: { color: c.border }, ticks: { color: c.textMuted, maxTicksLimit: 3, callback: v => fmtVolume(v) } },
        },
      },
    });
  }

  /* ── updateCandlestick ───────────────────────────────────────
     Chamado pelo market.js após receber dados OHLC do backend.
     Reconstrói os gráficos do zero para evitar bugs de escala. */
  function updateCandlestick(ohlcData) {
    setChartState('idle');

    /* Array vazio = moeda sem dados OHLC neste período */
    if (!ohlcData?.length) {
      setChartState('error', 'Dados indisponíveis para este período.');
      return;
    }

    const c = getChartColors();

    /* Formata dados OHLC para o formato do Chart.js */
    const formatted = ohlcData.map(([t, o, h, l, close]) => ({
      x: t, o, h, l, c: close,
    }));

    /* Cores das barras de volume: verde se fechou acima, vermelho se abaixo */
    const volumeColors = formatted.map(d =>
      d.c >= d.o ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'
    );

    /* Volume é um proxy visual — CoinGecko OHLC não inclui volume real.
       Usa amplitude (high - low) como indicador de volatilidade.        */
    const volumeData = formatted.map(d => ({
      x: d.x,
      y: Math.abs(d.h - d.l) * 1000,
    }));

    /* Reconstrói os gráficos do zero com a unidade de tempo correta */
    rebuildCandlestick(formatted, c);
    rebuildVolume(volumeData, volumeColors, c);
  }

  /* ── showChartLoading ────────────────────────────────────────
     Não exibe overlay de loading — mantém o gráfico anterior
     visível enquanto os novos dados chegam. Mais fluido.       */
  function showChartLoading() {
    /* intencional: não faz nada — gráfico anterior permanece */
  }

  /* ── Dominância (Donut) ──────────────────────────────────── */
  function initDominance() {
    const ctx = document.getElementById('dominanceChart');
    if (!ctx) return;
    const c = getChartColors();

    dominanceChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['BTC', 'ETH', 'Outros'],
        datasets: [{
          data:            [50, 20, 30],
          backgroundColor: [c.accent, c.up, c.border],
          borderColor:     'transparent',
          borderWidth:     0,
          hoverOffset:     6,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: true,
        cutout:              '70%',
        animation:           { duration: 800 },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color:     c.textMuted,
              font:      { size: 11 },
              padding:   12,
              boxWidth:  10,
              boxHeight: 10,
            },
          },
          tooltip: {
            callbacks: {
              label: (item) => ` ${item.label}: ${item.raw.toFixed(1)}%`,
            },
          },
        },
      },
    });
  }

  function updateDominance(globalData) {
    if (!dominanceChart) return;

    const btc    = globalData.market_cap_percentage?.btc || 0;
    const eth    = globalData.market_cap_percentage?.eth || 0;
    const others = Math.max(0, 100 - btc - eth);

    dominanceChart.data.datasets[0].data = [
      parseFloat(btc.toFixed(1)),
      parseFloat(eth.toFixed(1)),
      parseFloat(others.toFixed(1)),
    ];
    dominanceChart.update();

    const center = document.getElementById('donutBtcValue');
    if (center) center.textContent = btc.toFixed(1) + '%';
  }

  /* ── Sparkline nos cards de moeda ───────────────────────────
     Mini gráfico de linha com dados de sparkline da CoinGecko.
     Destrói o chart anterior antes de criar para evitar leak.  */
  function drawSparkline(canvas, values, isPositive) {
    if (!canvas || !values?.length) return;
    const c = getChartColors();

    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: values.map((_, i) => i),
        datasets: [{
          data:            values,
          borderColor:     isPositive ? c.up : c.down,
          borderWidth:     1.5,
          pointRadius:     0,
          fill:            true,
          backgroundColor: isPositive
            ? 'rgba(34,197,94,0.08)'
            : 'rgba(239,68,68,0.08)',
          tension: 0.4,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation:           { duration: 400 },
        plugins: {
          legend:  { display: false },
          tooltip: { enabled: false },
        },
        scales: {
          x: { display: false },
          y: { display: false },
        },
      },
    });
  }

  /* ── Refresh de cores ao trocar tema ────────────────────────
     Disparado pelo MutationObserver quando data-theme muda.
     Atualiza apenas as cores — não reconstrói os gráficos.    */
  function refreshTheme() {
    const c = getChartColors();

    if (candlestickChart) {
      candlestickChart.options.scales.x.grid.color  = c.border;
      candlestickChart.options.scales.x.ticks.color = c.textMuted;
      candlestickChart.options.scales.y.grid.color  = c.border;
      candlestickChart.options.scales.y.ticks.color = c.textMuted;
      candlestickChart.update();
    }

    if (volumeChart) {
      volumeChart.options.scales.y.grid.color  = c.border;
      volumeChart.options.scales.y.ticks.color = c.textMuted;
      volumeChart.update();
    }

    if (dominanceChart) {
      dominanceChart.data.datasets[0].backgroundColor       = [c.accent, c.up, c.border];
      dominanceChart.options.plugins.legend.labels.color    = c.textMuted;
      dominanceChart.update();
    }
  }

  /* ── Init ────────────────────────────────────────────────── */
  function init() {
    initCandlestick();
    initVolume();
    initDominance();

    /* Atualiza cores dos gráficos quando o tema muda */
    const observer = new MutationObserver(() => {
      setTimeout(refreshTheme, 50);
    });
    observer.observe(document.documentElement, {
      attributes:      true,
      attributeFilter: ['data-theme'],
    });
  }

  return {
    init,
    updateCandlestick,
    updateDominance,
    drawSparkline,
    showChartLoading,
  };
})();