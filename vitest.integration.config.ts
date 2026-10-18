import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
  },
  resolve: {
    alias: {
      '@finance-hub/database': path.resolve(__dirname, './packages/database/src/index.ts'),
      '@finance-hub/core': path.resolve(__dirname, './packages/core/src/index.ts'),
    },
  },
});