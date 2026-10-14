import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const server = process.env.CONTAMINANT_SERVER ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  // relative base so the build also works from file:// inside the Electron desktop shell
  base: './',
  server: {
    port: 5173,
    fs: { allow: ['../..'] },
    proxy: {
      '/api': server,
      '/overlay': server,
      '/ws': { target: server.replace(/^http/, 'ws'), ws: true },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    sourcemap: false,
  },
});
