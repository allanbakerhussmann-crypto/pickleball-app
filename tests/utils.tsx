/**
 * Test Utilities
 * 
 * Shared utilities, mocks, and helpers for testing.
 * 
 * FILE LOCATION: tests/utils.tsx
 */

import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

// ============================================
// Mock Auth Context
// ============================================

interface MockUser {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

interface MockUserProfile {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
}

interface MockAuthContext {
  currentUser: MockUser | null;
  userProfile: MockUserProfile | null;
  loading: boolean;
  isOrganizer: boolean;
  isAppAdmin: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  signup: () => Promise<void>;
  resetPassword: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  reloadUser: () => Promise<void>;
  updateUserProfile: () => Promise<void>;
  updateUserEmail: () => Promise<void>;
  updateUserExtendedProfile: () => Promise<void>;
}

export const mockAuthContext: MockAuthContext = {
  currentUser: null,
  userProfile: null,
  loading: false,
  isOrganizer: false,
  isAppAdmin: false,
  login: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  signup: vi.fn().mockResolvedValue(undefined),
  resetPassword: vi.fn().mockResolvedValue(undefined),
  resendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  reloadUser: vi.fn().mockResolvedValue(undefined),
  updateUserProfile: vi.fn().mockResolvedValue(undefined),
  updateUserEmail: vi.fn().mockResolvedValue(undefined),
  updateUserExtendedProfile: vi.fn().mockResolvedValue(undefined),
};

export const createMockUser = (overrides: Partial<MockUser> = {}): MockUser => ({
  uid: 'test-user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  emailVerified: true,
  ...overrides,
});

export const createMockUserProfile = (overrides: Partial<MockUserProfile> = {}): MockUserProfile => ({
  id: 'test-user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  roles: ['player'],
  ...overrides,
});

// Create the mock context
const MockAuthContext = React.createContext<MockAuthContext>(mockAuthContext);

export const MockAuthProvider: React.FC<{
  children: React.ReactNode;
  value?: Partial<MockAuthContext>;
}> = ({ children, value = {} }) => {
  const contextValue = { ...mockAuthContext, ...value };
  return (
    <MockAuthContext.Provider value={contextValue}>
      {children}
    </MockAuthContext.Provider>
  );
};

// ============================================
// Custom Render with Providers
// ============================================

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialRoute?: string;
  authContextValue?: Partial<MockAuthContext>;
}

/**
 * Custom render function that wraps components with necessary providers
 */
export const renderWithProviders = (
  ui: ReactElement,
  options: CustomRenderOptions = {}
) => {
  const {
    initialRoute = '/',
    authContextValue = {},
    ...renderOptions
  } = options;

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <MemoryRouter initialEntries={[initialRoute]}>
      <MockAuthProvider value={authContextValue}>
        {children}
      </MockAuthProvider>
    </MemoryRouter>
  );

  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

// ============================================
// Mock Data Factories
// ============================================

export const createMockTournament = (overrides = {}) => ({
  id: `tournament-${Math.random().toString(36).substr(2, 9)}`,
  name: 'Test Tournament',
  description: 'A test tournament',
  location: 'Test Venue',
  city: 'Test City',
  country: 'NZL',
  region: 'Canterbury',
  organizerId: 'organizer-123',
  startDatetime: Date.now() + 86400000, // Tomorrow
  endDatetime: Date.now() + 172800000, // Day after tomorrow
  status: 'published',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

export const createMockDivision = (overrides = {}) => ({
  id: `division-${Math.random().toString(36).substr(2, 9)}`,
  tournamentId: 'tournament-1',
  name: 'Open Doubles',
  eventType: 'doubles' as const,
  genderCategory: 'mixed' as const,
  maxTeams: 16,
  ...overrides,
});

export const createMockTeam = (overrides = {}) => ({
  id: `team-${Math.random().toString(36).substr(2, 9)}`,
  tournamentId: 'tournament-1',
  divisionId: 'division-1',
  name: 'Team A',
  player1Id: 'player-1',
  player2Id: 'player-2',
  status: 'confirmed',
  ...overrides,
});

export const createMockMatch = (overrides = {}) => ({
  id: `match-${Math.random().toString(36).substr(2, 9)}`,
  tournamentId: 'tournament-1',
  divisionId: 'division-1',
  teamAId: 'team-a',
  teamBId: 'team-b',
  status: 'not_started',
  roundNumber: 1,
  stage: 'pool',
  ...overrides,
});

export const createMockClub = (overrides = {}) => ({
  id: `club-${Math.random().toString(36).substr(2, 9)}`,
  name: 'Test Club',
  slug: 'test-club',
  description: 'A test club',
  country: 'NZL',
  region: 'Canterbury',
  createdByUserId: 'user-123',
  admins: ['user-123'],
  members: ['user-123'],
  createdAt: Date.now(),
  ...overrides,
});

export const createMockMeetup = (overrides = {}) => ({
  id: `meetup-${Math.random().toString(36).substr(2, 9)}`,
  title: 'Test Meetup',
  description: 'A test meetup',
  location: 'Test Location',
  datetime: Date.now() + 86400000,
  maxParticipants: 20,
  createdByUserId: 'user-123',
  createdAt: Date.now(),
  ...overrides,
});

// ============================================
// Wait Utilities
// ============================================

/**
 * Wait for a condition to be true
 */
export const waitFor = async (
  condition: () => boolean,
  timeout = 5000,
  interval = 100
): Promise<void> => {
  const startTime = Date.now();
  
  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('waitFor timeout');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
};

/**
 * Wait for next tick
 */
export const tick = () => new Promise(resolve => setTimeout(resolve, 0));
