# Custom Additions & Advanced Risk Guardrails

This document summarizes the custom functionality, risk management modules, and analysis tools added to the Polymarket Copy Trading Bot.

## 1. Advanced Risk Guardrails (`OrderValidator.ts`)

To protect capital and ensure high-quality trade execution, the following filters were integrated into the order validation flow:

### The "Inverse Bond" Ceiling
*   **Constant**: `MAX_COPY_PRICE = 0.92`
*   **Logic**: Aborts any BUY order if the best available market price exceeds $0.92.
*   **Rationale**: Prevents entering trades with a poor risk-to-reward ratio (e.g., risking $0.93 to make $1.00). Focuses the bot on conviction trades with higher upside.

### Wash Trade & Self-Fill Detection
*   **Logic**: "Market Dominance" check.
*   **Requirement**: Aborts execution if the leader's trade represents more than 2% of the total 24h market volume (used as a high-sensitivity proxy for 60s dominance).
*   **Rationale**: Avoids copying wash trades or self-fills in thin order books.

### BigNumber Precision
*   **Implementation**: All price and slippage comparisons refactored to use `ethers.BigNumber`.
*   **Rationale**: Eliminates JavaScript floating-point errors, ensuring exact precision for tight 0.5% slippage guards.

---

## 2. Execution Engine Enhancements (`postOrder.ts`)

### Liquidity Vacuum Fix (Limit Orders)
*   **Shift**: Replaced all Market (FOK) orders with **GTC (Good-Til-Cancelled) Limit Orders**.
*   **Price Setting**: Orders are placed at the **exact price** the leader paid, ensuring we don't "chase" the market.

### Order Reaper
*   **Logic**: A `setTimeout` of 120 seconds is applied to every limit order.
*   **Action**: if the order is not fully filled within 2 minutes, the bot automatically calls `clobClient.cancelOrder()`.
*   **Rationale**: Prevents being "picked off" by the market if the price moves against us while an order is sitting open.

---

## 3. Analysis & Auditing Tools

A suite of powerful CLI tools was added to evaluate traders and optimize bot parameters.

### Trader Discovery & Analysis
*   `npm run export-leaderboard`: Fetches the top 1000 traders across 10 major categories (Politics, Crypto, etc.). Generates `top_traders_by_category.json` and a **dark-mode HTML report** (`leaderboard_report.html`).
*   `npm run analyze-top-traders`: Scans the exported leaderboard for "Scalpers" (Avg Entry < $0.75, Exit Freq > 15%). Generates a **dark-mode HTML report** (`scalper_analysis_report.html`).
*   `npm run find-scalpers`: Targeted real-time discovery of traders with high capital velocity.

### Backtesting & Simulation
*   `npm run audit <address> <days> [copy_size] [min_leader]`: A position-aware simulator that tracks buys, sells, and final resolutions to calculate real PnL, ROI, and Win Rate.
*   `npm run batch-audit`: Runs the audit across multiple parameter combinations (e.g., $5 vs $2 trades) to find the most profitable setup for a specific budget.
*   `npm run portfolio-audit`: Runs a side-by-side 365-day backtest on the top 10 scalper candidates.

---

## 4. Portfolio Management

### Instant Liquidation
*   `npm run sell-all`: A "panic button" script that iterates through every position in your Proxy Wallet and sells 100% of the holdings to the best available bids. Useful for clearing capital to switch strategies.

---

## 5. Testing & Stability

*   **New Test Suite**: Added `OrderValidator.test.ts` to verify all risk guardrails and BigNumber comparisons.
*   **Stabilization**: Resolved ESM compatibility issues with the `chalk` library and fixed timing-dependent failures in the integration tests. All 76 tests are now passing.
