import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://server:4000';

export default defineConfig({
    plugins: [react()],
    build: {
        outDir: 'build',
        emptyOutDir: true,
    },
    optimizeDeps: {
        force: true,
    },
    server: {
        port: 5173,
        allowedHosts: true,
        proxy: {
            '/api': { target: apiProxyTarget, changeOrigin: true },
        },
    },
});
