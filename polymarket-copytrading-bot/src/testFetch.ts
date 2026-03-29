import fetchData from './utils/fetchData';
import Logger from './utils/logger';

async function test() {
    const address = '0x11577e174308dd2960ae18ccb3ca3c06a79f95e1';
    const apiUrl = `https://data-api.polymarket.com/activity?user=${address}&type=TRADE`;
    
    console.log(`Fetching from: ${apiUrl}`);
    try {
        const data = await fetchData(apiUrl);
        console.log('Success!', JSON.stringify(data, null, 2));
    } catch (error: any) {
        console.error('Error occurred:');
        console.error(error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

test();
