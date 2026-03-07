import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        allowedHosts: ['casa.acostajm.com'],
        proxy: {
            '/api': { target: 'http://server:4000', changeOrigin: true },
        },
    },
});
