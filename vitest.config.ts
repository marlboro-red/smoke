import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    benchmark: {
      include: ['src/**/__tests__/**/*.bench.ts'],
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'out/**',
        'dist/**',
        'coverage/**',
        'scripts/**',
        'build/**',
        'src/**/__tests__/**',
        '**/*.d.ts',
        '**/*.config.{ts,js}',
        '**/types.ts',
      ],
    },
  },
})
