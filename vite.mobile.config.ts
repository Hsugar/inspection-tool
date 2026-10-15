import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
import { cpSync, mkdirSync } from 'node:fs';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: `${root}mobile`,
  publicDir: `${root}public`,
  resolve: { alias: { '@': root } },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [
    react(),
    {
      name: 'bundle-offline-assets',
      closeBundle() {
        mkdirSync(`${root}dist-mobile/barcode`, { recursive: true });
        cpSync(`${root}public/barcode`, `${root}dist-mobile/barcode`, {
          recursive: true,
        });
        cpSync(`${root}public/brand`, `${root}dist-mobile/brand`, {
          recursive: true,
        });
        cpSync(
          `${root}public/gendx-device.png`,
          `${root}dist-mobile/gendx-device.png`,
        );
        cpSync(`${root}public/favicon.svg`, `${root}dist-mobile/favicon.svg`);
      },
    },
  ],
  build: {
    outDir: `${root}dist-mobile`,
    emptyOutDir: true,
    copyPublicDir: false,
    target: 'es2022',
  },
});
