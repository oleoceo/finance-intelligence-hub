import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../../../vitest.integration.config.js';

export default mergeConfig(base, defineConfig({
  test: { include: ['integrations/n8n/m06/p05/**/*.test.ts'] },
}));
