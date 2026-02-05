import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import { getViteConfig } from '@replit/vite-plugin-cartographer'
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cartographerConfig = getViteConfig()

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    ...(cartographerConfig?.plugins || []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
