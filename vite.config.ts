import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import glsl from 'vite-plugin-glsl'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), cssInjectedByJsPlugin(), glsl()],
  server: {
    port: 3333,
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
  esbuild: {
    ...(mode === 'production' && {
      drop: ['debugger', 'console'],
      legalComments: 'none',
    }),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-gsap': ['gsap'],
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ogl': ['ogl'],
        },
      },
    },
  },
}))
