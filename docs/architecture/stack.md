# Tech Stack

## Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.0 | UI framework |
| TypeScript | 5.8 | Type safety |
| Vite | 6.2.0 | Build tool and dev server |
| React Router | 6.20.0 | Client-side routing (hash-based) |

## Styling

- **Tailwind CSS** - Utility-first CSS (CDN-based)
- **Dark Theme**: `gray-950` background, `lime-500` accent
- **Font**: Inter (Google Fonts)

## State Management

- **React Context API** - Global state (AuthContext)
- **Custom Hooks** - Feature-specific state
- No Redux/Zustand - pure React patterns

## Backend (Firebase)

| Service | Purpose |
|---------|---------|
| Firestore | NoSQL database |
| Firebase Auth | Email/password authentication |
| Firebase Functions | Server-side logic |
| Firebase Storage | File uploads |

## External Integrations

| Integration | Purpose | Package |
|-------------|---------|---------|
| Stripe Connect | Payment processing | @stripe/stripe-js |
| DUPR API | Player ratings lookup and sync | Server-side only |
| SMSGlobal | SMS notifications | Server-side only |
| Google Gemini | AI features | Server-side only |
| Leaflet | Maps for venue locations | CDN |

## Additional Libraries

| Library | Purpose |
|---------|---------|
| @dnd-kit | Drag and drop (core, sortable) |
| PapaParse | CSV parsing (CDN) |

## CDN Dependencies

The following are loaded via CDN in `index.html`:
- Tailwind CSS
- Firebase SDK
- PapaParse
- Leaflet CSS/JS
