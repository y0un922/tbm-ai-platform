import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 端口与 @tbm/shared 的 API_PORT 一致
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})
