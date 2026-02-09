# Code Conventions

## File Naming

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase.tsx | `CreateTournament.tsx`, `Header.tsx` |
| Services | camelCase.ts | `duprService.ts`, `courtAllocator.ts` |
| Hooks | useCamelCase.ts | `useCheckout.ts`, `usePartnerInvites.ts` |
| Types | camelCase.ts or PascalCase.ts | In `/types` directory |

## Component Patterns

- Functional components only (no class components)
- Props interfaces defined at top of file
- Hooks for state: `useState`, `useEffect`, `useContext`, `useCallback`
- Custom hooks for reusable logic

## Import Organization

```typescript
// 1. React imports
import React, { useState, useEffect } from 'react';

// 2. Third-party libraries
import { useNavigate } from 'react-router-dom';

// 3. Internal services/types
import { getTournaments } from '../services/firebase/tournaments';
import { Tournament } from '../types';

// 4. Local components
import { Header } from './Header';
```

## Export Patterns

- Barrel exports via `index.ts` in feature directories
- Named exports preferred over default exports
- Example: `export { CheckoutModal, PaymentForm } from './checkout';`

## TypeScript Conventions

- Interfaces for object shapes
- Union types for enums: `type UserRole = 'player' | 'organizer' | 'app_admin'`
- Strict mode enabled
- Path alias: `@/*` resolves to project root

## Commit Message Format

```
VXX.XX Feature Name - Description

- Bullet point details
- Additional changes

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

## JSDoc Conventions

Components include header comments:

```typescript
/**
 * ComponentName - Brief description
 *
 * Key features:
 * - Feature 1
 * - Feature 2
 *
 * @version 06.03
 * @file components/feature/ComponentName.tsx
 */
```

## Version Naming

- Format: `VXX.XX` (e.g., V07.24)
- Major: Breaking changes or large features
- Minor: Feature additions and improvements
