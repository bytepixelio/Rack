/**
 * Vitest configuration
 *
 * Test environment configuration for registry-server
 */

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'dist/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.ts',
        'node_modules/**',
        'src/server.ts',
        'src/types.ts'
      ]
    },
    env: {
      // Set log level to silent during tests to reduce noise
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test'
    }
  }
})
