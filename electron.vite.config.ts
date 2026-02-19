import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: 'src/main/index.ts',
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: 'src/preload/index.ts',
        },
      },
    },
  },
  renderer: {
    // Minimal renderer build — just the placeholder HTML.
    // In dev: main process loads http://localhost:5173 (infinity-frontend dev server).
    // In prod: main process loads infinity-frontend/dist/index.html (copied by electron-builder).
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          index: 'src/renderer/index.html',
        },
      },
    },
  },
})
