/**
 * Test Setup File
 * 
 * This file runs before each test file.
 * It sets up testing utilities and global mocks.
 * 
 * FILE LOCATION: tests/setup.ts
 */

import '@testing-library/jest-dom';
import { vi } from 'vitest';

// ============================================
// Mock Browser APIs
// ============================================

// Mock window.matchMedia (used by some UI components)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.scrollTo
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

// ============================================
// Mock localStorage
// ============================================

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// ============================================
// Console Error Suppression (Optional)
// ============================================

// Suppress specific console errors during tests if needed
// const originalError = console.error;
// beforeAll(() => {
//   console.error = (...args) => {
//     if (args[0]?.includes('Warning: ReactDOM.render')) return;
//     originalError.call(console, ...args);
//   };
// });
// afterAll(() => {
//   console.error = originalError;
// });
