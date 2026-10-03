import { defineConfig } from 'vite';

// Library build: `npm run build:lib` -> dist-lib/emojiii.js (ESM, gsap stays a peer dependency)
export default defineConfig({
  build: {
    outDir: 'dist-lib',
    lib: { entry: 'src/lib/index.ts', formats: ['es'], fileName: () => 'emojiii.js' },
    rollupOptions: { external: ['gsap'] },
  },
});
