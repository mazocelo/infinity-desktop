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
        // Preload com sandbox: true não roda ESM; sai em CommonJS (.cjs).
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    // Só a página "sem conexão" da casca: as telas vêm do site
    // (https://infinity.voxcity.com.br; em dev, o Vite do front em :5173).
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
