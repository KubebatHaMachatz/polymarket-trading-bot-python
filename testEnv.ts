import * as dotenv from 'dotenv';
import * as path from 'path';

const envPath = path.resolve(process.cwd(), 'polymarket-copytrading-bot/.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

console.log('PROXY_WALLET:', process.env.PROXY_WALLET);
