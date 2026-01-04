import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true, // Needed for Docker
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://backend-api:5000',
        changeOrigin: true,
      },
    },
  },
})
