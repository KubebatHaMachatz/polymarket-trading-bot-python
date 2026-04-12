import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGO_URI;

async function testConnection() {
    console.log('Testing connection to:', MONGO_URI?.split('@')[1]); // Log only the host for security
    
    if (!MONGO_URI) {
        console.error('MONGO_URI is not defined in .env');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Successfully connected to MongoDB');

        // Create a temporary schema/model
        const TestSchema = new mongoose.Schema({
            testValue: String,
            timestamp: { type: Date, default: Date.now }
        }, { collection: 'connection_test' });

        const TestModel = mongoose.model('ConnectionTest', TestSchema);

        // WRITE
        const testData = { testValue: 'Bot verification test', timestamp: new Date() };
        const saved = await TestModel.create(testData);
        console.log('✅ Successfully wrote test record:', saved._id);

        // READ
        const retrieved = await TestModel.findById(saved._id);
        console.log('✅ Successfully read test record. Timestamp:', retrieved?.timestamp);

        // DELETE (Clean up)
        await TestModel.deleteOne({ _id: saved._id });
        console.log('✅ Successfully cleaned up test record');

        await mongoose.disconnect();
        console.log('🚀 MongoDB test passed 100%');
    } catch (error) {
        console.error('❌ MongoDB test failed:', error);
        process.exit(1);
    }
}

testConnection();
