import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const clientPort = process.env.PLAYWRIGHT_CLIENT_PORT || '4173';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${clientPort}`;
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    retries: process.env.CI ? 2 : 0,
    timeout: 45_000,
    expect: {
        timeout: 10_000,
    },
    use: {
        baseURL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    webServer: skipWebServer ? undefined : [
        {
            command: `npm run dev -- --host 127.0.0.1 --port ${clientPort}`,
            cwd: __dirname,
            url: baseURL,
            reuseExistingServer: !process.env.CI,
            env: {
                ...process.env,
                VITE_API_PROXY_TARGET: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:4000',
            },
        },
        {
            command: 'npm run dev',
            cwd: path.resolve(__dirname, '../server'),
            url: 'http://127.0.0.1:4000/api/health',
            reuseExistingServer: !process.env.CI,
            env: {
                ...process.env,
                JWT_SECRET: process.env.JWT_SECRET || 'playwright-secret',
                NODE_ENV: process.env.NODE_ENV || 'test',
            },
        },
    ],
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
