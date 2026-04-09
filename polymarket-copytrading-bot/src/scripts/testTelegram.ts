
import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const token = (process.env.TELEGRAM_TOKEN || '').trim();
const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();

async function test() {
    console.log('--- Telegram Connectivity Test ---');
    console.log(`Token:   ${token ? '✅ Found' : '❌ Missing'}`);
    console.log(`Chat ID: ${chatId ? `✅ ${chatId}` : '❌ Missing'}`);

    if (!token || !chatId) {
        console.error('\nERROR: Credentials missing in .env file.');
        process.exit(1);
    }

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        console.log(`\nAttempting to send message to Telegram...`);
        
        const response = await axios.post(url, {
            chat_id: chatId,
            text: '🚀 <b>Telegram Connection Verified</b>\n\nYour Polymarket bot is now successfully linked to this chat and ready to send notifications.',
            parse_mode: 'HTML'
        });

        if (response.data.ok) {
            console.log('\n✅ SUCCESS! Message sent to Telegram.');
            console.log('Check your Telegram app now.');
        }
    } catch (error: any) {
        console.log('\n❌ FAILED!');
        if (error.response) {
            console.error(`Telegram API Error: ${error.response.data.description}`);
            if (error.response.data.description === 'Bad Request: chat not found') {
                console.log('\n💡 TIP: You MUST send a message (like /start) to your bot FIRST before it can message you.');
            }
        } else {
            console.error(`Network Error: ${error.message}`);
        }
    }
}

test();
