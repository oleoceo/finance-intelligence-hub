import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    name: 'm06-p05-acceptance',
    include: ['integrations/n8n/m06/p05/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    pool: 'forks',
    singleFork: true,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@finance-hub/database': path.resolve(
        import.meta.dirname,
        '../../../../packages/database/src/index.ts',
      ),
      '@finance-hub/core': path.resolve(
        import.meta.dirname,
        '../../../../packages/core/src/index.ts',
      ),
    },
  },
});
