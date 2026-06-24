/* charts.js — Configuração e update dos gráficos */

const Charts = (() => {
  let candlestickChart = null;
  let volumeChart = null;
  let dominanceChart = null;

  // ── Helpers ───────────────────────────────────────────────

  function getCssVar(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name).trim();
  }

  function getChartColors() {
    return {
      accent: getCssVar('--accent'),
      up: getCssVar('--up'),
      down: getCssVar('--down'),
      border: getCssVar('--border'),
      text: getCssVar('--text'),
      textMuted: getCssVar('--text-muted'),
      surface: getCssVar('--surface'),
    };
  }

  // ── Candlestick ───────────────────────────────────────────

  function initCandlestick() {
    const ctx = document.getElementById('candlestickChart');
    if (!ctx) return;

    const c = getChartColors();

    candlestickChart = new Chart(ctx, {
      type: 'candlestick',
      data: { datasets: [{ label: 'OHLC', data: [] }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => {
                const { o, h, l, c } = item.raw;
                const change = ((c - o) / o * 100).toFixed(2);
                const sign = c >= o ? '▲' : '▼';
                return [
                  `Abertura:    ${fmtPrice(o)}`,
                  `Máximo:      ${fmtPrice(h)}`,
                  `Mínimo:      ${fmtPrice(l)}`,
                  `Fechamento:  ${fmtPrice(c)}`,
                  `Variação:    ${sign} ${change}%`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'hour' },
            grid: { color: c.border },
            ticks: { color: c.textMuted, maxTicksLimit: 8 },
          },
          y: {
            position: 'right',
            grid: { color: c.border },
            ticks: {
              color: c.textMuted,
              callback: (v) => fmtPrice(v),
            },
          },
        },
      },
    });
  }

  // ── Volume ────────────────────────────────────────────────

  function initVolume() {
    const ctx = document.getElementById('volumeChart');
    if (!ctx) return;

    const c = getChartColors();

    volumeChart = new Chart(ctx, {
      type: 'bar',
      data: { datasets: [{ label: 'Volume', data: [] }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600 },
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
            time: { unit: 'hour' },
            grid: { display: false },
            ticks: { display: false },
          },
          y: {
            position: 'right',
            grid: { color: c.border },
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

  function updateCandlestick(ohlcData) {
    if (!candlestickChart) return;

    const c = getChartColors();

    // Formata OHLC
    const formatted = ohlcData.map(([t, o, h, l, close]) => ({
      x: t, o, h, l, c: close,
    }));

    // Cores das barras de volume baseadas em alta/queda
    const volumeColors = formatted.map(d =>
      d.c >= d.o
        ? 'rgba(34,197,94,0.5)'
        : 'rgba(239,68,68,0.5)'
    );

    // Volume estimado (OHLC da CoinGecko não tem volume, usa amplitude como proxy visual)
    const volumeData = formatted.map(d => ({
      x: d.x,
      y: Math.abs(d.h - d.l) * 1000, // proxy visual
    }));

    // Atualiza candlestick
    candlestickChart.data.datasets[0].data = formatted;
    candlestickChart.data.datasets[0].color = {
      up: c.up,
      down: c.down,
      unchanged: c.textMuted,
    };
    candlestickChart.update('active');

    // Atualiza volume
    if (volumeChart) {
      volumeChart.data.datasets[0].data = volumeData;
      volumeChart.data.datasets[0].backgroundColor = volumeColors;
      volumeChart.data.datasets[0].borderColor = 'transparent';
      volumeChart.data.datasets[0].borderWidth = 0;
      volumeChart.update('active');
    }

    // Atualiza unidade de tempo baseada no range dos dados
    if (formatted.length > 1) {
      const range = formatted[formatted.length - 1].x - formatted[0].x;
      const days = range / (1000 * 60 * 60 * 24);
      const unit = days <= 1 ? 'hour' : days <= 14 ? 'day' : 'week';

      candlestickChart.options.scales.x.time.unit = unit;
      if (volumeChart) volumeChart.options.scales.x.time.unit = unit;

      candlestickChart.update();
      if (volumeChart) volumeChart.update();
    }
  }

  // ── Dominância (Donut) ────────────────────────────────────

  function initDominance() {
    const ctx = document.getElementById('dominanceChart');
    if (!ctx) return;

    const c = getChartColors();

    dominanceChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['BTC', 'ETH', 'Outros'],
        datasets: [{
          data: [50, 20, 30],
          backgroundColor: [c.accent, c.up, c.border],
          borderColor: 'transparent',
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '70%',
        animation: { duration: 800 },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: c.textMuted,
              font: { size: 11 },
              padding: 12,
              boxWidth: 10,
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

    const btc = globalData.market_cap_percentage?.btc || 0;
    const eth = globalData.market_cap_percentage?.eth || 0;
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

  // ── Sparkline nos cards ───────────────────────────────────

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
          data: values,
          borderColor: isPositive ? c.up : c.down,
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          backgroundColor: isPositive
            ? 'rgba(34,197,94,0.08)'
            : 'rgba(239,68,68,0.08)',
          tension: 0.4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false },
        },
      },
    });
  }

  // ── Refresh de cores ao trocar tema ───────────────────────

  function refreshTheme() {
    const c = getChartColors();

    if (candlestickChart) {
      candlestickChart.options.scales.x.grid.color = c.border;
      candlestickChart.options.scales.x.ticks.color = c.textMuted;
      candlestickChart.options.scales.y.grid.color = c.border;
      candlestickChart.options.scales.y.ticks.color = c.textMuted;
      candlestickChart.update();
    }

    if (volumeChart) {
      volumeChart.options.scales.y.grid.color = c.border;
      volumeChart.options.scales.y.ticks.color = c.textMuted;
      volumeChart.update();
    }

    if (dominanceChart) {
      dominanceChart.data.datasets[0].backgroundColor = [c.accent, c.up, c.border];
      dominanceChart.options.plugins.legend.labels.color = c.textMuted;
      dominanceChart.update();
    }
  }

  // ── Init ──────────────────────────────────────────────────

  function init() {
    initCandlestick();
    initVolume();
    initDominance();

    const observer = new MutationObserver(() => {
      setTimeout(refreshTheme, 50);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  return { init, updateCandlestick, updateDominance, drawSparkline };
})();