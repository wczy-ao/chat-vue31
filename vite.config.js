import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  base: './',
  define: mode === 'library' ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {},
  build: mode === 'library' ? {
    outDir: 'dist-lib',
    lib: { entry: 'src/index.js', name: 'ChatAssistant', formats: ['es', 'umd'], fileName: format => `chat-assistant.${format}.js`, cssFileName: 'chat-assistant' }
  } : { outDir: 'dist' }
}))
