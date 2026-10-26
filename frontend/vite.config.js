import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Dev: chuyển tiếp /api sang Flask để không cần cấu hình CORS
    proxy: {
      '/api': 'http://127.0.0.1:5000',
    },
  },
})
