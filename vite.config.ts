import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works at https://<user>.github.io/<repo>/ and from any folder.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'docs', emptyOutDir: true, assetsDir: 'assets', chunkSizeWarningLimit: 1200,
    rollupOptions: { output: { entryFileNames: 'assets/app.js', assetFileNames: a => ((a.names?.[0] ?? a.name ?? '').endsWith('.css') ? 'assets/app.css' : 'assets/[name]-[hash][extname]') } },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
