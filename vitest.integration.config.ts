import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    name: 'integration',
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    setupFiles: ['./vitest.setup.ts'],
    pool: 'forks',
    singleFork: true,
  },
  resolve: {
    alias: {
      '@finance-hub/database': path.resolve(
        import.meta.dirname,
        './packages/database/src/index.ts',
      ),
      '@finance-hub/core': path.resolve(import.meta.dirname, './packages/core/src/index.ts'),
    },
  },
});
