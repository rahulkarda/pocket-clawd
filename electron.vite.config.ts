import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') }
      }
    }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    },
    root: resolve('src/renderer'),
    build: {
      rollupOptions: {
        input: {
          chat: resolve('src/renderer/chat.html'),
          avatar: resolve('src/renderer/avatar.html'),
          todo: resolve('src/renderer/todo.html'),
          settings: resolve('src/renderer/settings.html')
        }
      }
    }
  }
})
