import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Tes integrasi memakai database yang sama; jalankan berurutan.
    fileParallelism: false,
    testTimeout: 30000
  }
});
