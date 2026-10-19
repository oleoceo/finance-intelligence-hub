export default [
  {
    test: {
      name: 'apps/api',
      include: ['apps/api/src/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    },
  },
  {
    test: {
      name: 'packages/core',
      include: ['packages/core/src/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    },
  },
  {
    test: {
      name: 'packages/database',
      include: ['packages/database/src/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    },
  },
];
