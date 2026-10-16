import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      include: ['apps/api/src/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    },
  },
  {
    test: {
      include: ['packages/core/src/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    },
  },
  {
    test: {
      include: ['packages/database/src/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    },
  },
]);
