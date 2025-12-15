# Task #7: Add Tests - Implementation Guide

## Overview

This task adds a testing framework (Vitest + React Testing Library) to the project with initial test coverage for key functionality.

## Files Created

### Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Updated with test dependencies and scripts |
| `vitest.config.ts` | Vitest configuration |
| `.github/workflows/test.yml` | GitHub Actions for CI |

### Test Files

| File | Tests |
|------|-------|
| `tests/setup.ts` | Test setup, mocks for browser APIs |
| `tests/utils.tsx` | Test utilities, mock factories |
| `tests/courtAllocator.test.ts` | Court allocation logic tests |
| `tests/locations.test.ts` | Location constants tests |
| `tests/ErrorBoundary.test.tsx` | ErrorBoundary component tests |
| `tests/ProtectedRoute.test.tsx` | Route protection tests |

## Setup Instructions

### Step 1: Copy Files to GitHub

Copy these files to your GitHub repository:

```
your-repo/
├── .github/
│   └── workflows/
│       └── test.yml          ← NEW
├── tests/
│   ├── setup.ts              ← NEW
│   ├── utils.tsx             ← NEW
│   ├── courtAllocator.test.ts ← NEW
│   ├── locations.test.ts     ← NEW
│   ├── ErrorBoundary.test.tsx ← NEW
│   └── ProtectedRoute.test.tsx ← NEW
├── package.json              ← REPLACE
└── vitest.config.ts          ← NEW
```

### Step 2: Run Tests Locally (Optional)

If you have Node.js installed on your computer:

```bash
# Navigate to your project folder
cd path/to/pickleball-director

# Install dependencies (first time only)
npm install

# Run tests in watch mode (re-runs on file changes)
npm test

# Run tests once
npm run test:run

# Run tests with coverage report
npm run test:coverage
```

### Step 3: GitHub Actions (Automatic)

Once you push to GitHub, the tests will run automatically on:
- Every push to `main` branch
- Every pull request to `main` branch

You can see the results in the "Actions" tab of your GitHub repository.

## Test Scripts

| Command | Description |
|---------|-------------|
| `npm test` | Run tests in watch mode |
| `npm run test:run` | Run tests once and exit |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run typecheck` | Check TypeScript types |

## Test Coverage

### What's Tested

1. **Court Allocator** (`courtAllocator.test.ts`)
   - Queue generation with priority ordering
   - Round balancing between divisions
   - Auto-assignment to free courts
   - Edge cases (empty queues, no courts)

2. **Location Constants** (`locations.test.ts`)
   - Country list completeness
   - Region lookup functions
   - Error handling for invalid inputs

3. **ErrorBoundary** (`ErrorBoundary.test.tsx`)
   - Renders children normally
   - Catches and displays errors
   - Custom fallback support
   - Recovery actions

4. **ProtectedRoute** (`ProtectedRoute.test.tsx`)
   - Authentication requirements
   - Organizer role checks
   - Admin role checks
   - Email verification checks
   - Redirect behavior

### What's NOT Tested Yet

These could be added in future iterations:

- Firebase service functions (require mocking Firebase)
- Full component integration tests
- End-to-end tests (require Playwright/Cypress)
- Tournament workflow tests
- Registration flow tests

## Adding More Tests

### Test File Naming

```
tests/
├── [feature].test.ts      # Unit tests for utilities
├── [Component].test.tsx   # Component tests
└── integration/
    └── [flow].test.tsx    # Integration tests
```

### Example: Adding a New Component Test

```typescript
// tests/MyComponent.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyComponent } from '../components/MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent title="Hello" />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('handles click events', async () => {
    const onClick = vi.fn();
    render(<MyComponent onClick={onClick} />);
    
    await userEvent.click(screen.getByRole('button'));
    
    expect(onClick).toHaveBeenCalled();
  });
});
```

### Example: Adding a Firebase Mock Test

```typescript
// tests/tournamentService.test.ts
import { describe, it, expect, vi } from 'vitest';

// Mock Firebase
vi.mock('../services/firebase', () => ({
  getTournament: vi.fn(),
  saveTournament: vi.fn(),
}));

import { getTournament, saveTournament } from '../services/firebase';

describe('Tournament Service', () => {
  it('fetches tournament by ID', async () => {
    const mockTournament = { id: '123', name: 'Test' };
    vi.mocked(getTournament).mockResolvedValue(mockTournament);

    const result = await getTournament('123');
    
    expect(result).toEqual(mockTournament);
  });
});
```

## Troubleshooting

### "Module not found" errors

Make sure all dependencies are installed:
```bash
npm install
```

### Tests pass locally but fail in CI

Check that:
1. All files are committed to Git
2. No hardcoded paths that differ between environments
3. Mock browser APIs are properly set up in `tests/setup.ts`

### Firebase-related errors

Firebase should be mocked in tests. If you see Firebase errors:
1. Add Firebase mocks to the test file
2. Or create a global mock in `tests/setup.ts`

## Benefits

✅ **Catch bugs early** - Before they reach production
✅ **Confidence to refactor** - Tests verify nothing breaks
✅ **Documentation** - Tests show how code should work
✅ **CI/CD ready** - Automated testing on every push
