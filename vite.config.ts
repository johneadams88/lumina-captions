import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // Full `ort-web` bundle contains an `eval` workaround for bundlers; Rollup warns and CSP can block it.
        // We only use the WASM execution provider (see @xenova/transformers backends/onnx.js), so alias to WASM-only build.
        'onnxruntime-web': path.resolve(
          __dirname,
          'node_modules/onnxruntime-web/dist/ort.wasm.min.js',
        ),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
