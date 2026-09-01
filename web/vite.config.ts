import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { dynamicApiProxy } from './lib/dynamic-proxy.mjs';

const installDynamicProxy = (middlewares: any) => {
  middlewares.use('/api-proxy', dynamicApiProxy);
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'dynamic-api-proxy',
      configureServer(server) {
        installDynamicProxy(server.middlewares);
      },
      configurePreviewServer(server) {
        installDynamicProxy(server.middlewares);
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5217,
    host: '0.0.0.0',
    strictPort: true,
  },
});
