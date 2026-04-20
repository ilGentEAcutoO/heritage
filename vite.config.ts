import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), cloudflare()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@app': path.resolve(__dirname, './src/app'),
      '@worker': path.resolve(__dirname, './src/worker'),
      '@db': path.resolve(__dirname, './src/db'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
});
