# Pickleball Director Documentation

This directory contains detailed documentation for the Pickleball Director platform. For quick reference and safety-critical information, see [CLAUDE.md](../CLAUDE.md) in the project root.

## Documentation Structure

### Architecture
- [Tech Stack](architecture/stack.md) - Frontend, backend, and external integrations
- [Project Structure](architecture/project-structure.md) - Directory layout and key files
- [Firestore Collections](architecture/firestore.md) - Database schema and indexes
- [Services Architecture](architecture/services.md) - Service layer organization and patterns

### Patterns
- [UI Inputs](patterns/ui-inputs.md) - ScrollTimePicker, price inputs, and form controls
- [Code Conventions](patterns/code-conventions.md) - Naming, imports, TypeScript, JSDoc
- [Domain Model](patterns/domain-model.md) - Users, tournaments, leagues, clubs, meetups

### Payments
- [Refunds](payments/refunds.md) - Refund system architecture and debugging
- [Stripe Connect](payments/stripe-connect.md) - Direct charges, connected accounts

### Tournaments
- [Court Allocation](tournaments/court-allocation.md) - Dynamic court assignment system

### Integrations
- [DUPR](integrations/dupr.md) - Rating integration, webhooks, match submission
- [Phone Verification](integrations/phone-verification.md) - OTP-based SMS verification

### Runbooks
- [Deployment](runbooks/deployment.md) - Extended deployment procedures
- [Debugging](runbooks/debugging.md) - Consolidated debugging guides

---

## Quick Links

| Topic | File | Description |
|-------|------|-------------|
| Deployment Safety | [CLAUDE.md](../CLAUDE.md#deployment-safety-rules-critical) | **CRITICAL** - Must read before any deployment |
| Match Format | [CLAUDE.md](../CLAUDE.md#unified-match-format-critical) | **CRITICAL** - Standard match interface |
| Payment Invariants | [CLAUDE.md](../CLAUDE.md#payment-invariants) | **CRITICAL** - organizerUserId, refund calculations |
| Commands | [CLAUDE.md](../CLAUDE.md#commands) | Dev, build, test commands |
| Environment Variables | [CLAUDE.md](../CLAUDE.md#environment-variables) | Required .env configuration |
