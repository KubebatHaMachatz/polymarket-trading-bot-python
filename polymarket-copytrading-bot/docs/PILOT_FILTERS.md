# 🛡️ Pilot Trading Filters (Capital Protection)

This document details the three strategic filters implemented for the pilot budget ($300, $5/trade) to protect capital from market noise and high slippage.

## 🚀 Overview

The pilot trading strategy uses a small budget and requires high-conviction trades in liquid markets. To achieve this, three specific filters have been added to the execution pipeline.

---

## 🔍 The Three Filters

### 1. 🧹 Dusting Filter (`MIN_LEADER_TRADE_USD`)

**Value:** `$1,000` (Default)

**Rationale:**
Large "whales" often execute tiny "noise" trades ($0.10–$50) to test liquidity or "dust" followers (misleading bots). These trades are usually not high-conviction moves and can bleed a small pilot account through transaction costs and suboptimal entries.

**Requirement:**
Before processing a trade, the bot checks the USD value of the leader's transaction. If it's below the threshold, the trade is skipped.

**Log Message:**
`[SKIP] Trade size below threshold. (Leader traded $50.00, min $1000.00)`

---

### 2. 💧 Liquidity Filter (`MIN_MARKET_24H_VOL`)

**Value:** `$100,000` (Default)

**Rationale:**
In low-volume markets, even a $5 order can suffer from a wide bid-ask spread. By sticking to high-volume markets, we ensure deep liquidity and tighter spreads.

**Requirement:**
The bot fetches real-time 24h volume for the specific market from the Polymarket Gamma API. If the volume is below the threshold, the trade is aborted.

**Log Message:**
`[SKIP] Market liquidity insufficient. (24h Vol $8105.21 < $100000.00)`

---

### 3. 🛡️ Slippage Guard (`MAX_PRICE_DEVIATION`)

**Value:** `0.005` (0.5%) (Default)

**Rationale:**
If a leader's massive trade ($10k+) moves the price significantly before our bot reacts, we risk "chasing" the trade at a much worse price. This filter ensures we only enter if the current market price is very close to what the leader paid.

**Requirement:**
The bot compares the leader's execution price with the current best Ask (for buys) or best Bid (for sells) on the order book. If the deviation exceeds 0.5%, the trade is cancelled.

**Log Message:**
`[SKIP] Price deviation too high (Slippage). (Current Ask $0.0520 is 15.56% > leader's $0.0450)`

---

## ⚙️ Configuration

These filters are fully configurable in your `.env` file:

```env
# Minimum USD value of the leader's trade to follow
MIN_LEADER_TRADE_USD=1000.0

# Minimum 24h volume of the market in USD
MIN_MARKET_24H_VOL=100000.0

# Maximum allowed price deviation (0.005 = 0.5%)
MAX_PRICE_DEVIATION=0.005
```

---

## 🛠️ Technical Implementation

- **Location**: Primary logic resides in `src/services/OrderValidator.ts` and `src/utils/postOrder.ts`.
- **API**: Uses the **Polymarket Gamma API** for real-time market volume and the **Polymarket CLOB** for live order book data.
- **Precision**: Uses standard floating-point math with careful rounding for financial calculations.
- **Timing**: Validation occurs immediately before order placement to ensure data is as fresh as possible.

---

## 📈 Rationale for Pilot Success

For a $300 budget executing $5 trades:
1. **Focus**: You only follow "high-conviction" moves from whales.
2. **Quality**: You only trade in "Bond-style" or high-volume Geopolitical markets.
3. **Price**: You never "chase" a pump, ensuring your entry is as good as the whale's.
