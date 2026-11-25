import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './', // relative, so the built site works from any folder or sub-path
  plugins: [react()],
  server: { proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } }, // `npm start` runs the garden server in dev
})
