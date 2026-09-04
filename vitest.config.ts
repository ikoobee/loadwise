import { defineConfig } from 'vitest/config';

// Explicitly aggregate all workspace package tests — do not rely on default
// file discovery across package boundaries.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
});
