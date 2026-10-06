import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const e2e = process.env.E2E === '1';

export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false, chunkSizeWarningLimit: 2000 },
  test: {
    include: e2e ? ['tests/**/*.e2e.test.ts'] : ['src/**/*.test.ts', 'tests/**/*.test.ts', 'seed/**/*.test.ts'],
    exclude: e2e ? [] : ['tests/**/*.e2e.test.ts', 'node_modules/**'],
    environment: 'node',
    testTimeout: e2e ? 180_000 : 10_000,
  },
} as never);
