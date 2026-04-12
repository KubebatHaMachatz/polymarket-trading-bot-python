import axios from 'axios';
import fetchData from '../../utils/fetchData';
import { NetworkError } from '../../errors';

// Mock chalk to avoid ESM issue in Jest
jest.mock('chalk', () => ({
    red: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    blue: (s: string) => s,
    cyan: (s: string) => s,
    magenta: (s: string) => s,
    gray: (s: string) => s,
    dim: (s: string) => s,
    bold: (s: string) => s,
    underline: (s: string) => s,
}));

// Mock environment
jest.mock('../../config/env', () => ({
    ENV: {
        NETWORK_RETRY_LIMIT: 2,
        REQUEST_TIMEOUT_MS: 100,
    },
}));

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('fetchData', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return data on successful request', async () => {
        const mockData = { test: 'data' };
        mockedAxios.get.mockResolvedValueOnce({ data: mockData });

        const result = await fetchData('https://api.example.com/test');
        expect(result).toEqual(mockData);
    });

    it('should throw error on failure', async () => {
        mockedAxios.get.mockRejectedValue(new Error('Failed'));
        await expect(fetchData('https://api.example.com/test')).rejects.toThrow();
    });
});
