# Multi-Instance Setup & Verification Guide

This guide explains how to set up a second instance of the Polymarket Copy Trading Bot to follow a different trader using a different wallet.

## 1. Create a New Instance Directory

Copy the entire bot directory to a new location:

```bash
# Example: Create a copy for a new trader
cp -R polymarket-copytrading-bot polymarket-bot-trader2
cd polymarket-bot-trader2
```

## 2. Configure the New Instance

Open the `.env` file in the new directory and update the following:

- `PRIVATE_KEY`: Your **new** secondary wallet's private key.
- `USER_ADDRESSES`: The **new** trader's address you want to follow.
- `MONGO_URI`: (Optional but Recommended) Change the database name to keep data separate.
  - Example: `mongodb://localhost:27017/polymarket_trader2`
- `FETCH_INTERVAL`: Set to `10` (to avoid rate limits).

## 3. Deployment Commands

Run these commands in order within the **new** directory:

```bash
# Install dependencies (if not already copied)
npm install

# Build the project
npm run build

# Verify the new wallet has USDC.e allowance (Required for first-time use)
npm run verify-allowance

# If allowance is NOT set (the command above fails), run:
npm run check-allowance

# Start the bot with a UNIQUE name in PM2
pm2 start dist/index.js --name "polymarket-bot2"
```

## 4. Verification & Health Check

Use these commands to ensure the new instance is healthy and active:

### Check Service Status
```bash
# List all running bots
pm2 list

# View logs for the new bot (replace 'polymarket-bot2' or use the ID)
pm2 logs polymarket-bot2 --lines 50
```

### Run Internal Health Check
```bash
# Runs a comprehensive check on DB, RPC, Balance, and API
npm run health-check
```

### Manual Verification of Balance & Allowance
```bash
# Check if the bot sees your USDC.e and has permission to trade
npm run verify-allowance
```

## 5. Persistence (Important)

To ensure your new bot starts automatically if the server reboots:

```bash
pm2 save
```

---

## Troubleshooting Checklist

| Problem | Command to Fix |
|---------|----------------|
| **"Not enough balance/allowance"** | `npm run check-allowance` |
| **Bot not seeing new trades** | Verify `USER_ADDRESSES` in `.env` is the active trading wallet of the trader. |
| **Circuit Breaker Errors** | Ensure `FETCH_INTERVAL` is at least `5` (10 is safer). |
| **Old data showing up** | Ensure `MONGO_URI` is unique for this instance. |
