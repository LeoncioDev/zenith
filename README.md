# Zenith 📈

Real-time cryptocurrency dashboard with live price feeds, candlestick charts, dominance data, Fear & Greed index, and a currency converter.

## Tech Stack

**Frontend:** HTML · CSS · JavaScript  
**Backend:** Node.js · Express · WebSocket  
**APIs:** Binance WebSocket · CoinGecko · alternative.me

## Features

- Live price feeds via Binance WebSocket
- Candlestick OHLC chart with volume
- BTC dominance donut chart
- Fear & Greed Index
- Real-time currency converter
- Market table with sorting and search
- 4 visual themes: Dark, Light, Hacker, Blood

## Getting Started

```bash
cd backend
npm install
npm start
```

Open: http://localhost:8000

## Project Structure

```
zenith/
├── frontend/
│   ├── index.html
│   ├── css/
│   │   ├── base.css
│   │   ├── components.css
│   │   ├── animations.css
│   │   └── themes/
│   └── js/
│       ├── app.js
│       ├── websocket.js
│       ├── charts.js
│       ├── market.js
│       ├── ticker.js
│       ├── themes.js
│       └── converter.js
└── backend/
    ├── server.js       # Express + WebSocket server
    ├── ws-relay.js     # Binance WebSocket relay
    ├── coingecko.js    # CoinGecko API client
    └── package.json
```
