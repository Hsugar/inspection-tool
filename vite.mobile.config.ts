import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
import { cpSync, mkdirSync } from 'node:fs';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: `${root}mobile`,
  publicDir: false,
  resolve: { alias: { '@': root } },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [
    react(),
    {
      name: 'bundle-offline-barcode',
      closeBundle() {
        mkdirSync(`${root}dist-mobile/barcode`, { recursive: true });
        cpSync(`${root}public/barcode`, `${root}dist-mobile/barcode`, {
          recursive: true,
        });
      },
    },
  ],
  build: { outDir: `${root}dist-mobile`, emptyOutDir: true, target: 'es2022' },
});
