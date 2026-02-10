/**
 * ProtectedRoute Tests
 * 
 * Tests for route protection and authorization.
 * 
 * FILE LOCATION: tests/ProtectedRoute.test.tsx
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock the AuthContext
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../contexts/AuthContext';
import { ProtectedRoute } from '../router/ProtectedRoute';

const mockedUseAuth = vi.mocked(useAuth);

// Helper to render with router
const renderWithRouter = (ui: React.ReactElement, initialRoute = '/protected') => {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/tournaments" element={<div>Tournaments Page</div>} />
        <Route path="/protected" element={ui} />
      </Routes>
    </MemoryRouter>
  );
};

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner while auth is loading', () => {
    mockedUseAuth.mockReturnValue({
      currentUser: null,
      userProfile: null,
      loading: true,
      isOrganizer: false,
      isAppAdmin: false,
    } as any);

    const { container } = renderWithRouter(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    // Should show loading spinner, not protected content
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    // Check for spinner animation class
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders children when user is authenticated', () => {
    mockedUseAuth.mockReturnValue({
      currentUser: { uid: 'user-123', emailVerified: true },
      userProfile: { roles: ['player'] },
      loading: false,
      isOrganizer: false,
      isAppAdmin: false,
    } as any);

    renderWithRouter(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects to tournaments when user is not authenticated', () => {
    mockedUseAuth.mockReturnValue({
      currentUser: null,
      userProfile: null,
      loading: false,
      isOrganizer: false,
      isAppAdmin: false,
    } as any);

    renderWithRouter(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    // Should redirect to tournaments
    expect(screen.getByText('Tournaments Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('shows access denied when requireOrganizer and user is not organizer', () => {
    mockedUseAuth.mockReturnValue({
      currentUser: { uid: 'user-123', emailVerified: true },
      userProfile: { roles: ['player'] },
      loading: false,
      isOrganizer: false,
      isAppAdmin: false,
    } as any);

    renderWithRouter(
      <ProtectedRoute requireOrganizer>
        <div>Organizer Only Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText(/organizer permissions/i)).toBeInTheDocument();
  });

  it('renders children when requireOrganizer and user is organizer', () => {
    mockedUseAuth.mockReturnValue({
      currentUser: { uid: 'user-123', emailVerified: true },
      userProfile: { roles: ['organizer'] },
      loading: false,
      isOrganizer: true,
      isAppAdmin: false,
    } as any);

    renderWithRouter(
      <ProtectedRoute requireOrganizer>
        <div>Organizer Only Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Organizer Only Content')).toBeInTheDocument();
  });

  it('shows access denied when requireAdmin and user is not admin', () => {
    mockedUseAuth.mockReturnValue({
      currentUser: { uid: 'user-123', emailVerified: true },
      userProfile: { roles: ['player'] },
      loading: false,
      isOrganizer: false,
      isAppAdmin: false,
    } as any);

    renderWithRouter(
      <ProtectedRoute requireAdmin>
        <div>Admin Only Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText(/administrator permissions/i)).toBeInTheDocument();
  });

  it('renders children when requireAdmin and user is admin', () => {
    mockedUseAuth.mockReturnValue({
      currentUser: { uid: 'user-123', emailVerified: true },
      userProfile: { roles: ['admin'] },
      loading: false,
      isOrganizer: false,
      isAppAdmin: true,
    } as any);

    renderWithRouter(
      <ProtectedRoute requireAdmin>
        <div>Admin Only Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Admin Only Content')).toBeInTheDocument();
  });

  it('shows verification required when requireVerified and email not verified', () => {
    mockedUseAuth.mockReturnValue({
      currentUser: { uid: 'user-123', emailVerified: false },
      userProfile: { roles: ['player'] },
      loading: false,
      isOrganizer: false,
      isAppAdmin: false,
    } as any);

    renderWithRouter(
      <ProtectedRoute requireVerified>
        <div>Verified Only Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Email Verification Required')).toBeInTheDocument();
  });

  it('renders custom fallback when provided and auth fails', () => {
    mockedUseAuth.mockReturnValue({
      currentUser: null,
      userProfile: null,
      loading: false,
      isOrganizer: false,
      isAppAdmin: false,
    } as any);

    renderWithRouter(
      <ProtectedRoute fallback={<div>Custom Fallback</div>}>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Custom Fallback')).toBeInTheDocument();
  });
});
