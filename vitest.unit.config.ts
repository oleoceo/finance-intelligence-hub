import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'unit',
    include: [
      'apps/api/src/**/*.test.ts',
      'packages/core/src/**/*.test.ts',
      'packages/database/src/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**', 'tests/integration/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
