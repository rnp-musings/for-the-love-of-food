import { defineConfig } from 'astro/config';

// Served from https://rnp-musings.github.io/for-the-love-of-food/ on GitHub Pages.
export default defineConfig({
  site: 'https://rnp-musings.github.io',
  base: '/for-the-love-of-food',
  trailingSlash: 'always',
});
