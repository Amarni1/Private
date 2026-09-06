import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import path from 'path';

const parentModules = path.resolve(__dirname, '..', 'node_modules');

export default defineConfig({
  plugins: [react(), wasm()],
  server: { port: 5173 },
  build: {
    target: 'esnext',
  },
  resolve: {
    alias: {
      '@midnight-ntwrk/onchain-runtime-v3': path.join(parentModules, '@midnight-ntwrk/onchain-runtime-v3'),
      '@midnight-ntwrk/ledger-v8': path.join(parentModules, '@midnight-ntwrk/ledger-v8'),
      '@midnight-ntwrk/compact-runtime': path.join(parentModules, '@midnight-ntwrk/compact-runtime'),
    },
  },
  optimizeDeps: {
    exclude: ['@midnight-ntwrk/onchain-runtime-v3'],
  },
  define: {
    'global': 'globalThis',
  },
});
