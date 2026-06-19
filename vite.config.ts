import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import path from 'node:path';

/**
 * Inline the built stylesheet into <head> as a <style> tag and drop the
 * render-blocking <link rel="stylesheet">. The CSS is small gzipped (~8 KB) and
 * is on the critical path for first paint; inlining removes a render-blocking
 * request AND lets the browser parse the @font-face rules at HTML-parse time, so
 * the preloaded webfont is applied on the FIRST paint (no fallback→Prompt swap,
 * which otherwise inflates Speed Index). Runs in the client build only.
 */
function inlineCss(): Plugin {
  return {
    name: 'inline-critical-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const css = Object.values(bundle).filter(
        (a): a is typeof a & { type: 'asset' } =>
          a.type === 'asset' && a.fileName.endsWith('.css'),
      );
      const html = Object.values(bundle).filter(
        (a): a is typeof a & { type: 'asset' } =>
          a.type === 'asset' && a.fileName.endsWith('.html'),
      );
      if (!css.length || !html.length) return;
      for (const page of html) {
        let src = page.source.toString();
        for (const sheet of css) {
          const base = sheet.fileName.split('/').pop()!.replace(/[.]/g, '\\.');
          const linkRe = new RegExp(`<link[^>]*href="[^"]*${base}"[^>]*>`, 'g');
          src = src.replace(linkRe, `<style>${sheet.source.toString()}</style>`);
        }
        page.source = src;
      }
      // The CSS is now inlined everywhere — drop the now-orphaned asset.
      for (const sheet of css) delete bundle[sheet.fileName];
    },
  };
}

export default defineConfig({
  plugins: [react(), cloudflare(), inlineCss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@app': path.resolve(__dirname, './src/app'),
      '@worker': path.resolve(__dirname, './src/worker'),
      '@db': path.resolve(__dirname, './src/db'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
});
