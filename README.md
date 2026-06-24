# Zenith 📈

> Real-time cryptocurrency dashboard with live price feeds, candlestick charts, market dominance, Fear & Greed index, and a currency converter — all updating without a single page refresh.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat&logo=express&logoColor=white)
![Binance](https://img.shields.io/badge/Binance-WebSocket-F3BA2F?style=flat&logo=binance&logoColor=black)
![CoinGecko](https://img.shields.io/badge/CoinGecko-API-8DC63F?style=flat)

---

## What it does

Zenith combines a persistent Binance WebSocket connection with REST data from CoinGecko to deliver a fully real-time crypto dashboard. Prices update every second. No polling. No page reloads.

---

## How it works

```
┌─────────────────────────────────────────────────────────┐
│  Binance WebSocket (wss://stream.binance.com)           │
│  10 symbols · @miniTicker stream · updates every 1s     │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  ws-relay.js — BinanceRelay                             │
│  · Single connection shared across all browser clients  │
│  · Keeps latest data cached for new connections         │
│  · Auto-reconnects on disconnect · Ping every 3 min     │
└─────────────────────────┬───────────────────────────────┘
                          │ broadcast
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Browser clients (/ws/prices)                           │
│  · Receive snapshot on connect (instant data)           │
│  · Receive ticker events every ~1s per symbol           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  coingecko.js — REST client (60s cache + stale fallback)│
│  · /api/markets    → coin list, sparklines, % changes   │
│  · /api/global     → market cap, BTC dominance          │
│  · /api/ohlc       → candlestick data (1D/7D/1M/3M)    │
│  · /api/fear-greed → Fear & Greed Index (1h cache)      │
└─────────────────────────────────────────────────────────┘
```

---

## Features

- **Live price ticker** — horizontal scrolling bar with real-time prices and % change for 10 symbols
- **Candlestick chart** — OHLC data with volume bars, time range selector (1D · 7D · 1M · 3M)
- **Market overview** — stats cards (market cap, volume 24h, BTC dominance, Fear & Greed)
- **Coin cards** — top 10 coins with live prices, sparklines and 24h change, drag to scroll
- **Market table** — full coin list with sortable columns and live search
- **BTC dominance** — animated donut chart with BTC/ETH/Others breakdown
- **Currency converter** — real-time conversion between USD and 5 cryptocurrencies
- **4 visual themes** — Dark, Light, Hacker, Blood — persisted in localStorage
- **Dynamic tab title** — shows live BTC price with 🟢/🔴 direction indicator

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML · CSS · JavaScript |
| Backend | Node.js · Express · WebSocket (`ws`) |
| Live prices | Binance WebSocket API |
| Market data | CoinGecko REST API v3 |
| Fear & Greed | alternative.me API |
| Charts | Chart.js + chartjs-chart-financial + Luxon |

---

## Getting Started

### Prerequisites

- Node.js 18+
- No API keys required — Binance and CoinGecko public endpoints are free

### Installation

```bash
git clone https://github.com/LeoncioDev/zenith.git
cd zenith/backend

npm install
npm start
```

Open [http://localhost:8000](http://localhost:8000)

---

## Project Structure

```
zenith/
├── frontend/
│   ├── index.html
│   ├── favicon.svg
│   ├── css/
│   │   ├── base.css          # Reset, variables, layout
│   │   ├── components.css    # Cards, table, charts, converter
│   │   ├── animations.css    # Ticker scroll, flash, skeleton
│   │   └── themes/           # dark.css · light.css · hacker.css · blood.css
│   └── js/
│       ├── utils.js          # Shared formatters (fmtPrice, fmtPct, fmtLarge)
│       ├── app.js            # Entry point — initializes modules, wires WS events
│       ├── websocket.js      # WS connection, pub/sub, auto-reconnect
│       ├── ticker.js         # Scrolling price ticker
│       ├── charts.js         # Candlestick, volume, dominance, sparklines
│       ├── market.js         # REST data, coin cards, market table
│       ├── themes.js         # Theme switcher + dynamic tab title
│       └── converter.js      # Real-time currency converter
│
└── backend/
    ├── server.js             # Express server + WebSocket server
    ├── ws-relay.js           # Binance relay (BinanceRelay class)
    ├── coingecko.js          # CoinGecko + Fear & Greed client with cache
    └── package.json
```

---

## API Reference

### `GET /api/markets`

Returns coin list with prices, sparklines, and % changes.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `vs_currency` | string | `usd` | Reference currency |
| `per_page` | number | `50` | Number of coins |

### `GET /api/global`

Returns global market data: total market cap, volume 24h, BTC/ETH dominance.

### `GET /api/ohlc/:coinId`

Returns OHLC candlestick data for a coin.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `vs_currency` | string | `usd` | Reference currency |
| `days` | number | `1` | Time range (1, 7, 30, 90) |

### `GET /api/fear-greed`

Returns Fear & Greed Index from alternative.me.

```json
{ "value": 23, "label": "Extreme Fear" }
```

### `WS /ws/prices`

WebSocket stream. Sends two event types:

```json
{ "type": "snapshot", "data": { "BTC": { "symbol": "BTC", "price": 64179.30, "change_pct": 0.25 }, ... } }
{ "type": "ticker",   "data": { "symbol": "BTC", "price": 64180.00, "change_pct": 0.26, "high": 64500.00, "low": 63800.00 } }
```

`snapshot` is sent immediately on connect with the latest cached data for all symbols.
`ticker` is sent every ~1 second per symbol as data arrives from Binance.

### `GET /api/status`

```json
{ "status": "ok", "relay_clients": 1, "symbols_cached": ["BTC", "ETH", ...] }
```

---

## Design Decisions

**Why a server-side relay instead of connecting to Binance directly from the browser?**
Browsers can't connect to Binance WebSocket due to CORS. The relay also centralizes the connection — 1 Binance connection serves N browser clients instead of each browser opening its own.

**Why cache REST data on the server instead of fetching from the browser?**
CoinGecko rate-limits unauthenticated requests aggressively. Caching on the server means all browser clients share a single cached response, reducing API calls from N to 1 per interval.

**Why stale cache as fallback?**
If CoinGecko is temporarily unavailable, serving 60-second-old data is better than showing an error. The user sees data, the dashboard stays functional.

**Why duplicate the ticker HTML for the scroll loop?**
CSS `animation` with `translateX` needs content long enough to scroll continuously. Duplicating the HTML creates a seamless loop without JavaScript timers.

---

## Built by

**João Paulo Leôncio** — [github.com/LeoncioDev](https://github.com/LeoncioDev)
