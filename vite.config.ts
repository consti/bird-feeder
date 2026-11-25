import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// relative base so the built site works from any folder or sub-path
export default defineConfig({ base: './', plugins: [react()] })
