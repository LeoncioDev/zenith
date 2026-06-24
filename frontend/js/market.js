/* market.js — Dados REST (CoinGecko via backend) + updates WebSocket */

const Market = (() => {
  const SYMBOL_TO_ID = {
    BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin',
    SOL: 'solana', XRP: 'ripple', ADA: 'cardano',
    DOGE: 'dogecoin', AVAX: 'avalanche-2', MATIC: 'matic-network',
    LINK: 'chainlink',
  };

  let marketsData = [];
  let currentCoin = 'bitcoin';
  let currentDays = 1;
  let sortKey = 'rank';
  let sortAsc = true;
  let searchQuery = '';
  const liveCacheUSD = {};

  // ── Formatadores (fmtPrice, fmtLarge, fmtPct, fmtVolume em utils.js) ──

  // ── Skeletons ─────────────────────────────────────────────

  function renderSkeletonCards() {
    const grid = document.getElementById('coinsGrid');
    if (!grid) return;
    grid.innerHTML = Array(8).fill(0).map(() => `
      <div class="coin-card coin-card--skeleton">
        <div class="coin-card__header">
          <span class="coin-card__symbol"> </span>
          <span class="coin-card__change"> </span>
        </div>
        <div class="coin-card__price"> </div>
        <div class="coin-card__sparkline"></div>
      </div>
    `).join('');
  }

  function renderSkeletonTable() {
    const tbody = document.getElementById('marketTableBody');
    if (!tbody) return;
    tbody.innerHTML = Array(10).fill(0).map((_, i) => `
      <tr class="table-skeleton">
        <td><span class="skel" style="width:20px"></span></td>
        <td>
          <div class="table-coin">
            <div style="width:24px;height:24px;border-radius:50%;background:var(--surface-2)"></div>
            <div>
              <div class="skel" style="width:${60 + (i % 3) * 20}px;margin-bottom:4px"></div>
              <div class="skel" style="width:30px;height:10px"></div>
            </div>
          </div>
        </td>
        <td><span class="skel" style="width:80px"></span></td>
        <td><span class="skel" style="width:50px"></span></td>
        <td><span class="skel" style="width:50px"></span></td>
        <td><span class="skel" style="width:50px"></span></td>
        <td><span class="skel" style="width:70px"></span></td>
        <td><span class="skel" style="width:80px"></span></td>
      </tr>
    `).join('');
  }

  // ── Drag to scroll ────────────────────────────────────────

  function initCardDrag() {
    const grid = document.getElementById('coinsGrid');
    const section = document.querySelector('.coins-section');
    if (!grid) return;

    let isDown = false, startX, scrollLeft;

    grid.addEventListener('mousedown', e => {
      isDown = true;
      grid.classList.add('is-dragging');
      startX = e.pageX - grid.offsetLeft;
      scrollLeft = grid.scrollLeft;
    });

    document.addEventListener('mouseup', () => {
      isDown = false;
      grid.classList.remove('is-dragging');
    });

    grid.addEventListener('mousemove', e => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - grid.offsetLeft;
      grid.scrollLeft = scrollLeft - (x - startX) * 0.8;
    });

    let touchStartX, touchScrollLeft;
    grid.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].pageX;
      touchScrollLeft = grid.scrollLeft;
    }, { passive: true });

    grid.addEventListener('touchmove', e => {
      const dx = touchStartX - e.touches[0].pageX;
      grid.scrollLeft = touchScrollLeft + dx;
    }, { passive: true });

    if (section) {
      grid.addEventListener('scroll', () => {
        const atEnd = grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 10;
        section.classList.toggle('at-end', atEnd);
      });
    }
  }

  // ── Render Cards ──────────────────────────────────────────

  function renderCards(coins) {
    const grid = document.getElementById('coinsGrid');
    if (!grid) return;

    grid.innerHTML = '';
    coins.slice(0, 10).forEach(coin => {
      const sym = coin.symbol.toUpperCase();
      const cached = liveCacheUSD[sym];
      const price = cached?.usdPrice ?? coin.current_price;
      const changePct = cached?.change_pct ?? coin.price_change_percentage_24h;
      const isUp = changePct >= 0;

      const card = document.createElement('div');
      card.className = 'coin-card card-loaded' + (coin.id === currentCoin ? ' active' : '');
      card.dataset.id = coin.id;
      card.dataset.symbol = sym;

      card.innerHTML = `
        <div class="coin-card__header">
          <span class="coin-card__symbol">${sym}</span>
          <span class="coin-card__change coin-card__change--${isUp ? 'up' : 'down'}" id="change-${sym}">
            ${fmtPct(changePct)}
          </span>
        </div>
        <div class="coin-card__price" id="price-${sym}" data-usd-price="${price}">
          ${fmtPrice(price)}
        </div>
        <div class="coin-card__sparkline">
          <canvas id="sparkline-${sym}"></canvas>
        </div>
      `;

      card.addEventListener('click', () => selectCoin(coin.id, sym));
      grid.appendChild(card);

      const sparkCanvas = card.querySelector(`#sparkline-${sym}`);
      if (coin.sparkline_in_7d?.price) {
        Charts.drawSparkline(sparkCanvas, coin.sparkline_in_7d.price, isUp);
      }
    });
  }

  // ── Render Table ──────────────────────────────────────────

  function renderTable() {
    const tbody = document.getElementById('marketTableBody');
    if (!tbody) return;

    document.querySelectorAll('.market-table th[data-sort]').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.sort === sortKey) th.classList.add(sortAsc ? 'sort-asc' : 'sort-desc');
    });

    let data = [...marketsData];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(c => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
    }

    const fieldMap = {
      rank: 'market_cap_rank', name: 'name', price: 'current_price',
      change1h: 'price_change_percentage_1h_in_currency',
      change24h: 'price_change_percentage_24h',
      change7d: 'price_change_percentage_7d_in_currency',
      volume: 'total_volume', marketcap: 'market_cap',
    };

    data.sort((a, b) => {
      const field = fieldMap[sortKey] || 'market_cap_rank';
      const av = a[field], bv = b[field];
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="loading-msg">Nenhuma moeda encontrada.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(coin => {
      const sym = coin.symbol.toUpperCase();
      const cached = liveCacheUSD[sym];
      const price = cached?.usdPrice ?? coin.current_price;
      const ch1h = coin.price_change_percentage_1h_in_currency;
      const ch24h = cached?.change_pct ?? coin.price_change_percentage_24h;
      const ch7d = coin.price_change_percentage_7d_in_currency;

      return `
        <tr data-id="${coin.id}" data-symbol="${sym}">
          <td style="color:var(--text-muted)">${coin.market_cap_rank}</td>
          <td>
            <div class="table-coin">
              <img class="table-coin__img" src="${coin.image}" alt="${coin.name}" loading="lazy" />
              <div>
                <div class="table-coin__name">${coin.name}</div>
                <div class="table-coin__symbol">${sym}</div>
              </div>
            </div>
          </td>
          <td class="td-price" id="tprice-${sym}">${fmtPrice(price)}</td>
          <td class="td-change td-change--${ch1h >= 0 ? 'up' : 'down'}">${fmtPct(ch1h)}</td>
          <td class="td-change td-change--${ch24h >= 0 ? 'up' : 'down'}" id="tchange-${sym}">${fmtPct(ch24h)}</td>
          <td class="td-change td-change--${ch7d >= 0 ? 'up' : 'down'}">${fmtPct(ch7d)}</td>
          <td class="td-volume">${fmtLarge(coin.total_volume)}</td>
          <td class="td-marketcap">${fmtLarge(coin.market_cap)}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('tr[data-id]').forEach(row => {
      row.addEventListener('click', () => selectCoin(row.dataset.id, row.dataset.symbol));
    });
  }

  // ── Toast ─────────────────────────────────────────────────

  function showToast(msg, type = 'error') {
    let toast = document.getElementById('apiToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'apiToast';
      toast.className = 'api-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = `api-toast api-toast--${type} api-toast--visible`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('api-toast--visible'), 5000);
  }

  // ── Stats ─────────────────────────────────────────────────

  function setStatLoading(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('is-loading');
  }

  function setStatValue(id, val) {
    const el = document.getElementById(id);
    if (el) { el.textContent = val; el.classList.remove('is-loading'); }
  }

  async function loadGlobal() {
    try {
      const resp = await fetch('/api/global');
      if (!resp.ok) throw new Error(resp.status);
      const data = await resp.json();
      Charts.updateDominance(data);
      setStatValue('statMarketCap', fmtLarge(data.total_market_cap?.usd));
      setStatValue('statVolume', fmtLarge(data.total_volume?.usd));
      setStatValue('statBtcDominance', (data.market_cap_percentage?.btc || 0).toFixed(1) + '%');
    } catch (e) {
      console.error('Erro global:', e);
      showToast('⚠️ Dados globais indisponíveis.');
      setStatValue('statMarketCap', 'Erro');
    }
  }

  async function loadFearGreed() {
    try {
      const resp = await fetch('/api/fear-greed');
      if (!resp.ok) throw new Error(resp.status);
      const data = await resp.json();
      setStatValue('statFearGreed', `${data.value} — ${data.label}`);
      setStatValue('fearValue', data.value);
      setStatValue('fearLabel', data.label);
      const fill = document.getElementById('fearFill');
      if (fill) fill.style.width = data.value + '%';
    } catch (e) { console.error('Erro fear greed:', e); }
  }

  async function loadMarkets() {
    try {
      const resp = await fetch('/api/markets?per_page=50&vs_currency=usd');
      if (!resp.ok) throw new Error(resp.status);
      const data = await resp.json();
      marketsData = data;
      renderCards(data);
      renderTable();
    } catch (e) {
      console.error('Erro markets:', e);
      showToast('⚠️ Mercado indisponível. Tentando novamente em 60s...');
    }
  }

  async function loadOHLC(coinId, days) {
    try {
      const resp = await fetch(`/api/ohlc/${coinId}?days=${days}&vs_currency=usd`);
      if (!resp.ok) throw new Error(resp.status);
      const data = await resp.json();
      Charts.updateCandlestick(data);
    } catch (e) {
      console.error('Erro OHLC:', e);
      showToast('⚠️ Gráfico indisponível.');
    }
  }

  // ── Seleção de moeda ──────────────────────────────────────

  function selectCoin(coinId, symbol) {
    currentCoin = coinId;
    document.querySelectorAll('.coin-card').forEach(card => {
      card.classList.toggle('active', card.dataset.id === coinId);
    });
    const titleEl = document.getElementById('chartTitle');
    if (titleEl) titleEl.textContent = `${symbol} / USDT`;
    const selectEl = document.getElementById('chartCoinSelect');
    if (selectEl && [...selectEl.options].find(o => o.value === coinId)) selectEl.value = coinId;
    loadOHLC(coinId, currentDays);
  }

  // ── Update preço via WebSocket ────────────────────────────

  function updatePrice(ticker) {
    const { symbol, price, change_pct } = ticker;

    liveCacheUSD[symbol] = { usdPrice: price, change_pct };

    const priceEl = document.getElementById(`price-${symbol}`);
    if (priceEl) {
      const prev = parseFloat(priceEl.dataset.usdPrice || '0');
      priceEl.textContent = fmtPrice(price);
      priceEl.dataset.usdPrice = price;
      priceEl.classList.remove('flash-up', 'flash-down');
      void priceEl.offsetWidth;
      priceEl.classList.add(price >= prev ? 'flash-up' : 'flash-down');
    }

    const changeEl = document.getElementById(`change-${symbol}`);
    if (changeEl) {
      changeEl.textContent = fmtPct(change_pct);
      changeEl.className = `coin-card__change coin-card__change--${change_pct >= 0 ? 'up' : 'down'}`;
    }

    const tPriceEl = document.getElementById(`tprice-${symbol}`);
    if (tPriceEl) tPriceEl.textContent = fmtPrice(price);

    const tChangeEl = document.getElementById(`tchange-${symbol}`);
    if (tChangeEl) {
      tChangeEl.textContent = fmtPct(change_pct);
      tChangeEl.className = `td-change td-change--${change_pct >= 0 ? 'up' : 'down'}`;
    }

    const coinId = SYMBOL_TO_ID[symbol];
    if (coinId === currentCoin) {
      const chartPrice = document.getElementById('chartPrice');
      if (chartPrice) chartPrice.textContent = fmtPrice(price);
    }
  }

  // ── Init ──────────────────────────────────────────────────

  function init() {
    renderSkeletonCards();
    renderSkeletonTable();
    ['statMarketCap', 'statVolume', 'statBtcDominance', 'statFearGreed'].forEach(setStatLoading);

    loadMarkets();
    loadGlobal();
    loadFearGreed();
    loadOHLC(currentCoin, currentDays);
    initCardDrag();

    setInterval(loadMarkets, 60_000);
    setInterval(loadGlobal, 60_000);
    setInterval(loadFearGreed, 3_600_000);

    const coinSelect = document.getElementById('chartCoinSelect');
    coinSelect?.addEventListener('change', e => {
      const symbol = e.target.options[e.target.selectedIndex].text;
      selectCoin(e.target.value, symbol);
    });

    document.querySelectorAll('.tf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentDays = parseInt(btn.dataset.days);
        loadOHLC(currentCoin, currentDays);
      });
    });

    document.getElementById('tableSearch')?.addEventListener('input', e => {
      searchQuery = e.target.value;
      renderTable();
    });

    document.querySelectorAll('.market-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (sortKey === key) sortAsc = !sortAsc;
        else { sortKey = key; sortAsc = true; }
        renderTable();
      });
    });

    return { updatePrice };
  }

  return { init, updatePrice };
})();