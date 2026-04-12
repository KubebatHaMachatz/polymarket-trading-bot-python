
import axios from 'axios';

async function debug() {
    const user = "0x7f3c8979d0afa00007bae4747d5347122af05613";
    const url = `https://data-api.polymarket.com/activity?user=${user}&type=TRADE&limit=5`;
    
    try {
        const response = await axios.get(url);
        const trade = response.data[0];
        console.log("SAMPLE TRADE DATA:");
        console.log(JSON.stringify(trade, null, 2));

        if (trade.conditionId) {
            const marketUrl = `https://gamma-api.polymarket.com/markets?condition_id=${trade.conditionId}`;
            const mResponse = await axios.get(marketUrl);
            console.log("\nSAMPLE MARKET DATA (GAMMA):");
            console.log(JSON.stringify(mResponse.data[0], null, 2));
        }
    } catch (e) {
        console.error(e);
    }
}

debug();
