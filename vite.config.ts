import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';

/** npm package name for a module id inside node_modules ("@scope/name" or "name"). */
function packageOf(id: string): string | null {
  const norm = id.replace(/\\/g, '/');
  const at = norm.lastIndexOf('/node_modules/');
  if (at < 0) return null;
  const parts = norm.slice(at + '/node_modules/'.length).split('/');
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
}
const oneOf = (...names: string[]) => (p: string) => names.includes(p);
const prefix = (...pre: string[]) => (p: string) => pre.some((x) => p.startsWith(x));
const VENDOR_CHUNKS: [string, (pkg: string) => boolean][] = [
  ['vendor-react', oneOf('react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom')],
  ['vendor-charts', (p) => p === 'recharts' || p.startsWith('d3-') || oneOf('victory-vendor', 'internmap', 'decimal.js-light', 'eventemitter3', 'reselect', 'immer', '@reduxjs/toolkit', 'redux', 'react-redux', 'es-toolkit', 'tiny-invariant', 'use-sync-external-store')(p)],
  ['vendor-markdown', (p) => oneOf('react-markdown', 'unified', 'bail', 'devlop', 'trough', 'zwitch', 'ccount', 'longest-streak', 'markdown-table', 'trim-lines', 'is-plain-obj', 'property-information', 'space-separated-tokens', 'comma-separated-tokens', 'decode-named-character-reference', 'html-url-attributes', 'style-to-js', 'style-to-object', 'inline-style-parser', 'estree-util-is-identifier-name', 'escape-string-regexp')(p) || prefix('remark-', 'micromark', 'mdast-', 'hast-', 'unist-', 'vfile', 'character-entities')(p)],
  ['vendor-ui', (p) => p === 'radix-ui' || p.startsWith('@radix-ui/') || p.startsWith('@floating-ui/') || oneOf('cmdk', 'aria-hidden', 'use-callback-ref', 'use-sidecar', 'react-style-singleton', 'get-nonce', 'react-remove-scroll', 'react-remove-scroll-bar', 'sonner', 'class-variance-authority', 'clsx', 'tailwind-merge')(p)],
  ['vendor-motion', oneOf('motion', 'framer-motion', 'motion-dom', 'motion-utils')],
  ['vendor-icons', oneOf('lucide-react')],
  ['vendor-i18n', oneOf('i18next', 'react-i18next')],
  ['vendor-date', oneOf('date-fns')],
];

export default defineConfig(({mode}) => {
  // environment variables are no longer needed for the AI client
  const env = loadEnv(mode, process.cwd(), '');
  const PORT = env.PORT || '3000';

  return {
    base: '/',
    build: {
      outDir: 'dist',
      // dist/.vite/manifest.json → scripts/sw-precache.mjs (offline pages).
      manifest: true,
      rollupOptions: {
        output: {
          // Third-party code changes far less often than the app: separate
          // vendor chunks stay cached (immutable) across most deploys.
          // Only libraries the first screen needs anyway are grouped; anything
          // else (three.js, Monaco, …) stays with the lazy chunk that uses it.
          manualChunks(id: string) {
            const pkg = packageOf(id);
            if (!pkg) return undefined;
            for (const [chunk, test] of VENDOR_CHUNKS) if (test(pkg)) return chunk;
            return undefined;
          },
        },
      },
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      allowedHosts: ['firstinspires.junipervirtual.org'],
      proxy: {
        '/api': {
          target: `http://localhost:${PORT}`,
          changeOrigin: true,
        },
        '/uploads': {
          target: `http://localhost:${PORT}`,
          changeOrigin: true,
        }
      }
    },
  };
});
