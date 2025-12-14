# PickleballDirector

Professional tournament and league management platform for Pickleball — tournaments, leagues, live scoring, club management, and admin/organiser tools.

> This README documents the current implementation (main branch) and points to the code locations that implement the features.

---

## Table of contents

- [Features](#features)  
- [Data model & lifecycle](#data-model--lifecycle)  
- [Security & roles](#security--roles)  
- [Critical operations & Cloud Functions (server-side)](#critical-operations--cloud-functions-server-side)  
- [Rating & seeding policies](#rating--seeding-policies)  
- [Client & developer notes](#client--developer-notes)  
- [Developer tools & testing](#developer-tools--testing)  
- [Deployment](#deployment)  
- [API reference (Cloud Functions)](#api-reference-cloud-functions)  
- [Repository layout (high level)](#repository-layout-high-level)  
- [Changelog highlights](#changelog-highlights)  
- [Troubleshooting & where to look](#troubleshooting--where-to-look)

---

## Features

- **Tournaments**: Create events, manage divisions (singles/doubles), generate brackets and pools — implemented with UI components and server-side helpers.  
- **Leagues**: Long-running competitions with round-robin scheduling and automated standings.  
- **Live Scoring**: Players submit scores; opponent verification and server-side confirmation ensure finalization integrity.  
- **Clubs**: Club pages, membership and join requests for organizers and clubs.  
- **DUPR integration**: Mock DUPR service present for development (replaceable with a real proxy in production).

---

## Data model & lifecycle

Primary collections and responsibilities:

- `competitions` — league metadata (settings, divisions, organiser). Creation is server-side only to ensure consistency and audit logging.  
- `competitionEntries` — links players/teams to competitions; used by the scheduling generator.  
- `matches` — match documents (lifecycle: `scheduled` → `in_progress` → `pending_confirmation` → `completed` → `disputed`). Critical status changes are finalized server-side.  
- `standings` — server-authoritative standings for competitions; client writes are restricted for competition standings.  
- `teams`, `users`, `auditLogs`, etc. — used for seeding, permissions and audit trails.

---

## Security & roles

- **Auth**: Firebase Authentication used for all users.  
- **Roles**:
  - **App Admin** — global system admin permissions.  
  - **Organizer** — create/manage their own competitions/tournaments.  
  - **Player** — register, submit, and view scores for personal matches.
- **Enforcement**: Firestore security rules implement `isAdmin`, `isOrganizerForCompetition`, `isOrganizerForTournament`, etc. Clients are blocked from critical writes (e.g., `competitions` creation) and must call Cloud Functions for protected operations.

---

## Critical operations & Cloud Functions (server-side)

Critical flows run on the server (HTTPS Cloud Functions):

- Auth is validated server-side (token verification). Each function is wrapped in a `createHandler` that manages CORS, authentication and consistent error handling.  
- Server functions use Firestore transactions and batched writes to guarantee integrity and create audit logs.

**Key server operations** (examples):
- `createTeam` — deterministic team id generation, transaction-safe creation, and audit log.  
- `createCompetition` — server-side competition creation that enforces `organiserId`, `createdAt`, `status`, and audit logging.  
- `generateLeagueSchedule` — full league schedule generation: fetch entries, calculate seeding, create matches and write standings safely.

**Developer note**: Clients should use these functions for the operations above; Firestore rules prevent direct client writes where appropriate.

---

## Rating & seeding policies

- Implemented policies include `average` (default), `highest`, `captain`, and `weighted`.  
- Functions choose the best available rating source (DUPR, stored rating, or fallback) and aggregate according to the selected policy. This logic lives in server code to ensure consistent seeding.

---

## Client & developer notes

- **React**: The app uses modern React (e.g., `createRoot`) and updated dependencies.  
- **Firebase init**: `services/firebase.ts` uses an HMR-safe pattern (re-uses existing app instance, lazy initializes auth), which prevents duplicate initialization in development.

---

## Developer tools & testing

- **Dev Tools UI**: Admin-only component to run the integration test flow (Create → Schedule → Score → Verify). This is feature-flagged for safe usage in development.  
- **DEV_AUTH**: A development bypass (`DEBUG_BYPASS_AUTH`) exists for local testing only — do **not** enable in production.

---

## Deployment

**Pre-reqs**
- `firebase-tools` installed (`npm install -g firebase-tools`) and the project configured.

**High-level steps**
1. Deploy rules:
   ```bash
   firebase deploy --only firestore:rules
