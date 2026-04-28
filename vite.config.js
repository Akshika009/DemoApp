import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/health': 'http://localhost:5000',
      '/contracts': 'http://localhost:5000',
      '/metadata': 'http://localhost:5000',
    },
  },
})
