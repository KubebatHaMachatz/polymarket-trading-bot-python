# How to Track Your Bot's Activity

Since your bot trades directly from your EOA (Main Wallet), you can track its activity in two ways:

## 1. View on Polymarket Website (Action Required)
To see your positions and history on the Polymarket frontend, you must be logged in with the **exact same wallet** the bot is using.

1. **Get Private Key**: Copy the `PRIVATE_KEY` from your `.env` file.
2. **Import to MetaMask**:
   - Open MetaMask > Click Account Circle > **Import Account**.
   - Paste the Private Key.
3. **Connect to Polymarket**:
   - Go to [polymarket.com](https://polymarket.com).
   - Click **Connect Wallet** and select the newly imported account.
   - Ensure you are on the **Polygon Network**.

## 2. Quick Links (View Only)
You can view your wallet's active positions and on-chain transaction history using these direct links:

*   **Polymarket Profile**: [https://polymarket.com/profile/0x7dB8351c06a18E1591b5A8988005FAE06BB808e4](https://polymarket.com/profile/0x7dB8351c06a18E1591b5A8988005FAE06BB808e4)
*   **Polygonscan (Transactions)**: [https://polygonscan.com/address/0x7dB8351c06a18E1591b5A8988005FAE06BB808e4](https://polygonscan.com/address/0x7dB8351c06a18E1591b5A8988005FAE06BB808e4)

## 3. Bot Logs
You can always check what the bot is doing in real-time via PM2:
```bash
pm2 logs polymarket-bot1
```

---
**Note:** If you see "0 positions" on the website even after connecting the right wallet, double-check that you have **USDC.e** (bridged USDC) in that wallet, as that is what Polymarket uses for trading.
