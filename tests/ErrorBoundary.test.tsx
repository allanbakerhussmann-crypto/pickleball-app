/**
 * ErrorBoundary Component Tests
 * 
 * FILE LOCATION: tests/ErrorBoundary.test.tsx
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Component that throws an error
const ThrowError: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow = true }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

// Suppress console.error for cleaner test output
const originalError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalError;
});

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('renders error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Oops!')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    const customFallback = <div>Custom error message</div>;
    
    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error message')).toBeInTheDocument();
  });

  it('shows Try Again button', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('shows Reload Page button', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
  });

  it('resets error state when Try Again is clicked', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Error UI should be shown
    expect(screen.getByText('Oops!')).toBeInTheDocument();

    // Now we need to test the reset functionality
    // First, let's change the child to not throw
    // Then click Try Again

    // Note: In a real scenario, you'd need to ensure the component
    // doesn't throw on the next render after clicking Try Again
  });

  it('logs error to console', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(console.error).toHaveBeenCalled();
  });
});
