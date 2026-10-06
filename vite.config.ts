import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false, chunkSizeWarningLimit: 2000 },
  test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'], environment: 'node' },
} as never);
