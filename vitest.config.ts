import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Use jsdom for DOM testing
    environment: 'jsdom',
    
    // Setup files run before each test file
    setupFiles: ['./tests/setup.ts'],
    
    // Global test APIs (describe, it, expect) without imports
    globals: true,
    
    // Include test files
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    
    // Exclude patterns
    exclude: ['node_modules', 'functions'],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        'functions/',
        '**/*.d.ts',
        '**/*.config.*',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
