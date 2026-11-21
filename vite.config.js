import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/project-freetempo2/',
  build: {
    chunkSizeWarningLimit: 1000, // 기본값 500 -> 1000 kB로 상향
  },
})
