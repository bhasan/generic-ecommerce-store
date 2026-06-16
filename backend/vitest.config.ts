import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
      // Generated Prisma client and type-only declarations aren't ours to test.
      exclude: ['generated/**', '**/*.d.ts', '**/*.config.ts', 'src/index.ts'],
      // Regression ratchet: floors sit just below the current baseline so coverage
      // can't silently erode. Raise these as coverage improves — never lower them.
      // Run `npm run test:coverage` to see the current numbers.
      thresholds: {
        statements: 58,
        branches: 66,
        functions: 68,
        lines: 58,
      },
    },
  },
});
