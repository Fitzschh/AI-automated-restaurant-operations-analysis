import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  server: {
    proxy: {
      '/api/ai-analysis': {
        target: 'http://127.0.0.1:5001/device-streaming-ded679cd/us-central1/aiAnalysis',
        changeOrigin: true,
        rewrite: () => '/',
      },
    },
  },
});
