import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev: chuyển tiếp /api sang Flask để không cần cấu hình CORS
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
