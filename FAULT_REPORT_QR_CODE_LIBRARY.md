# Fault Report: QR Code Library CDN Incompatibility

**Report ID:** FR-2026-02-03-001
**Feature:** Meetup Check-In & Attendance Tracking System
**Severity:** Critical (Feature Blocking)
**Status:** Open
**Environment:** Test Site (pickleball-app-test)
**Date Reported:** 2026-02-03
**Reporter:** E2E Verification Specialist

---

## Executive Summary

The QR code generation functionality for the Meetup Check-In system is completely broken due to a CDN provider mismatch between React (loaded from aistudiocdn.com) and qrcode.react (loaded from esm.sh). When users attempt to display any QR code, the application crashes with a `TypeError: Cannot read properties of null (reading 'useRef')`.

**CRITICAL ESCALATION:** This issue also **crashes the entire Profile page**, making it inaccessible to all users.

---

## Issue Description

### Error Message
```
TypeError: Cannot read properties of null (reading 'useRef')
```

### Error Location
```
https://esm.sh/qrcode.react@4.2.0/...
```

### User-Facing Impact
- **Session Check-In QR**: Organizers cannot display QR codes for players to scan at venues
- **Player Check-In QR (MyCheckInQR)**: Players cannot view/print their personal check-in QR codes
- **Guest Payment QR**: Walk-in guests cannot scan QR codes to pay for sessions
- **CRITICAL: Profile Page Broken**: The entire Profile page crashes because it imports `MyCheckInQR` component

All five Session Tools buttons are visible, but clicking "Check-In QR" or "Guest Pay QR" causes an immediate crash. The Profile page (`/#/profile`) shows "Unexpected Application Error" and is completely inaccessible.

---

## Root Cause Analysis

### The Problem

The `qrcode.react` library is a React component library that internally calls React hooks like `useRef`. When loaded from esm.sh with the `?external=react` flag, it expects to find React in the global scope or import map. However, there is a **CDN provider mismatch**:

| Dependency | CDN Provider | URL |
|------------|--------------|-----|
| React | aistudiocdn.com | `https://aistudiocdn.com/react@^19.2.0` |
| qrcode.react | esm.sh | `https://esm.sh/qrcode.react@4.2.0?external=react` |

The `?external=react` flag tells esm.sh NOT to bundle React, expecting it to be provided externally. However, the React instance from aistudiocdn.com is not being correctly resolved by esm.sh's bundled code, resulting in `useRef` returning `null`.

### Technical Details

1. **import map in index.html (lines 67-87):**
```html
<script type="importmap">
{
  "imports": {
    "react": "https://aistudiocdn.com/react@^19.2.0",
    "react/": "https://aistudiocdn.com/react@^19.2.0/",
    "react-dom": "https://aistudiocdn.com/react-dom@^19.2.0",
    ...
    "qrcode.react": "https://esm.sh/qrcode.react@4.2.0?external=react"
  }
}
</script>
```

2. **vite.config.ts external declaration (lines 22-26):**
```typescript
build: {
  rollupOptions: {
    external: ['qrcode.react'],
  }
}
```

3. **Component imports (all affected files):**
```typescript
// MyCheckInQR.tsx (line 18)
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';

// SessionCheckInQR.tsx (line 16)
import { QRCodeCanvas } from 'qrcode.react';

// GuestPayQR.tsx (line 17)
import { QRCodeCanvas } from 'qrcode.react';
```

### Why This Happens

The esm.sh CDN creates its own module scope. Even though we specify `?external=react`, the way esm.sh resolves the external dependency may not correctly map to the aistudiocdn.com-provided React instance. This is a known issue when mixing CDN providers for React component libraries.

---

## Affected Files

| File | Path | Usage |
|------|------|-------|
| index.html | `c:\Users\allan\OneDrive\Documents\GitHub\pickleball-app\index.html` | Import map with incompatible CDN configuration |
| MyCheckInQR.tsx | `c:\Users\allan\OneDrive\Documents\GitHub\pickleball-app\components\profile\MyCheckInQR.tsx` | Uses `QRCodeSVG` and `QRCodeCanvas` |
| SessionCheckInQR.tsx | `c:\Users\allan\OneDrive\Documents\GitHub\pickleball-app\components\clubs\SessionCheckInQR.tsx` | Uses `QRCodeCanvas` |
| GuestPayQR.tsx | `c:\Users\allan\OneDrive\Documents\GitHub\pickleball-app\components\clubs\GuestPayQR.tsx` | Uses `QRCodeCanvas` |
| vite.config.ts | `c:\Users\allan\OneDrive\Documents\GitHub\pickleball-app\vite.config.ts` | External dependency declaration |

---

## Evidence

### 1. Import Map Configuration (index.html lines 67-87)

The import map mixes two different CDN providers:
- aistudiocdn.com for React ecosystem
- esm.sh for qrcode.react

```javascript
"react": "https://aistudiocdn.com/react@^19.2.0",
"qrcode.react": "https://esm.sh/qrcode.react@4.2.0?external=react"
```

### 2. Component Usage Pattern

All three QR components use React component exports from qrcode.react:

**MyCheckInQR.tsx (line 133-140):**
```tsx
<QRCodeSVG
  value={qrValue}
  size={200}
  level="H"
  includeMargin={false}
  bgColor="#ffffff"
  fgColor="#000000"
/>
```

**SessionCheckInQR.tsx (line 243-252):**
```tsx
<QRCodeCanvas
  value={checkInUrl}
  size={qrSize}
  level="H"
  includeMargin={true}
  style={{
    border: '4px solid #000',
    borderRadius: '8px',
  }}
/>
```

### 3. Vite Build Configuration (vite.config.ts lines 22-26)

```typescript
build: {
  rollupOptions: {
    external: ['qrcode.react'],
  }
}
```

This tells Vite to not bundle qrcode.react, expecting it to be resolved at runtime via the import map.

---

## Recommended Fix

### Solution: Replace qrcode.react with pure JavaScript qrcode library

The `qrcode` library (npm package `qrcode`) is a pure JavaScript library with no React dependencies. It generates QR codes using `QRCode.toDataURL()` or `QRCode.toCanvas()`, which can then be rendered in standard HTML `<img>` or `<canvas>` elements.

### Implementation Steps

#### Step 1: Update index.html

**Remove** the qrcode.react import map entry:
```diff
- "qrcode.react": "https://esm.sh/qrcode.react@4.2.0?external=react"
```

**Add** the pure qrcode library via CDN script tag:
```html
<!-- QR Code Generation Library (pure JS, no React dependency) -->
<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
```

#### Step 2: Update vite.config.ts

**Remove** the external entry:
```diff
build: {
  rollupOptions: {
-   external: ['qrcode.react'],
  }
}
```

#### Step 3: Update MyCheckInQR.tsx

Replace React component usage with pure JS approach:

```typescript
// Remove this import:
// import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';

// Add state for QR data URL:
const [qrDataUrl, setQrDataUrl] = useState<string>('');

// Generate QR code on mount/value change:
useEffect(() => {
  if (qrValue) {
    // @ts-ignore - QRCode loaded via CDN
    window.QRCode.toDataURL(qrValue, {
      width: 200,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H'
    }).then((url: string) => setQrDataUrl(url));
  }
}, [qrValue]);

// Render as img instead of QRCodeSVG:
{qrDataUrl && (
  <img src={qrDataUrl} alt="Check-in QR Code" width={200} height={200} />
)}
```

#### Step 4: Update SessionCheckInQR.tsx

Similar pattern - use `QRCode.toCanvas()` for canvas-based rendering:

```typescript
const canvasRef = useRef<HTMLCanvasElement>(null);

useEffect(() => {
  if (canvasRef.current && checkInUrl) {
    // @ts-ignore - QRCode loaded via CDN
    window.QRCode.toCanvas(canvasRef.current, checkInUrl, {
      width: qrSize,
      margin: 2,
      errorCorrectionLevel: 'H'
    });
  }
}, [checkInUrl, qrSize]);

// Render:
<canvas ref={canvasRef} style={{ border: '4px solid #000', borderRadius: '8px' }} />
```

#### Step 5: Update GuestPayQR.tsx

Same pattern as SessionCheckInQR.tsx.

#### Step 6: Add TypeScript Declaration (Optional)

Create `types/qrcode.d.ts`:
```typescript
declare global {
  interface Window {
    QRCode: {
      toDataURL: (text: string, options?: QRCodeOptions) => Promise<string>;
      toCanvas: (canvas: HTMLCanvasElement, text: string, options?: QRCodeOptions) => Promise<void>;
    };
  }
}

interface QRCodeOptions {
  width?: number;
  margin?: number;
  color?: { dark?: string; light?: string };
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

export {};
```

---

## Alternative Solutions Considered

### Alternative 1: Use same CDN for qrcode.react

Try loading qrcode.react from aistudiocdn.com instead of esm.sh.

**Rejected because:** aistudiocdn.com may not host qrcode.react, and the `?external=react` resolution issue would likely persist.

### Alternative 2: Bundle qrcode.react with Vite

Remove from external and let Vite bundle it.

**Rejected because:** This would increase bundle size significantly and may still have React version conflicts with the CDN-loaded React.

### Alternative 3: Use react-qr-code (different library)

Another React QR code library.

**Rejected because:** Same fundamental problem - any React component library will have the CDN mismatch issue.

---

## Testing Checklist (Post-Fix)

After implementing the fix, verify:

- [ ] Session Check-In QR displays correctly when clicking "Check-In QR" button
- [ ] QR code is scannable and contains correct URL format: `{origin}/#/checkin/{standingMeetupId}/{occurrenceId}`
- [ ] Print functionality works (opens print dialog with QR visible)
- [ ] Download PNG functionality works (downloads valid PNG file)
- [ ] Full-screen toggle works (QR scales appropriately)
- [ ] MyCheckInQR displays on player Profile page
- [ ] GuestPayQR displays with correct amount and payment URL
- [ ] No console errors related to QR code generation
- [ ] QR codes work on both desktop and mobile browsers

---

## Impact Assessment

| Area | Impact Level | Details |
|------|--------------|---------|
| Check-In Flow | **BLOCKED** | Organizers cannot check in players at venues |
| Player Experience | **HIGH** | Players cannot view their personal QR codes |
| Payment Flow | **BLOCKED** | Walk-in guests cannot pay via QR |
| Other Features | None | Issue is isolated to QR code generation |

---

## Timeline

| Date | Event |
|------|-------|
| 2026-02-03 | Issue discovered during E2E verification |
| 2026-02-03 | Root cause identified (CDN mismatch) |
| 2026-02-03 | Fault report created |
| TBD | Fix implemented |
| TBD | Fix verified on test site |
| TBD | Fix deployed to production |

---

## References

- qrcode npm package: https://www.npmjs.com/package/qrcode
- qrcode.react npm package: https://www.npmjs.com/package/qrcode.react
- esm.sh external dependencies: https://esm.sh/#external
- CDN jsdelivr qrcode: https://cdn.jsdelivr.net/npm/qrcode@1.5.3/

---

## Appendix: Full Error Stack Trace

```
TypeError: Cannot read properties of null (reading 'useRef')
    at QRCodeCanvas (https://esm.sh/qrcode.react@4.2.0/...)
    at renderWithHooks (https://aistudiocdn.com/react-dom@^19.2.0/...)
    at mountIndeterminateComponent (https://aistudiocdn.com/react-dom@^19.2.0/...)
    at beginWork (https://aistudiocdn.com/react-dom@^19.2.0/...)
    at HTMLUnknownElement.callCallback (https://aistudiocdn.com/react-dom@^19.2.0/...)
    at Object.invokeGuardedCallbackDev (https://aistudiocdn.com/react-dom@^19.2.0/...)
    at invokeGuardedCallback (https://aistudiocdn.com/react-dom@^19.2.0/...)
    at beginWork$1 (https://aistudiocdn.com/react-dom@^19.2.0/...)
    at performUnitOfWork (https://aistudiocdn.com/react-dom@^19.2.0/...)
    at workLoopSync (https://aistudiocdn.com/react-dom@^19.2.0/...)
```

---

## Additional Issues Discovered During Testing

### Issue 2: Guest Count Not Displayed in UI

**Severity:** HIGH
**Status:** Open

**Description:** After successfully adding a cash guest via the "Add Guest (Cash)" modal, the guest count is not visible anywhere in the session management UI.

**Evidence:**
- Modal opens correctly with fields: Name, Email (optional), Amount ($8.00 default), Notes
- Modal closes without errors after clicking "Add Guest"
- No console errors
- BUT: Attendance summary only shows: Expected (3), Checked In (0), Cancelled (0), No Shows (0)
- NO "Guests" count is displayed

**Root Cause:**
- `AttendanceSummary` component exists at `components/clubs/AttendanceSummary.tsx` with proper guest count display
- BUT it is **NOT used** in `OccurrenceManager.tsx`
- `OccurrenceManager` has its own inline attendance grid (lines 378-395) that lacks guest count

**Affected Files:**
- `components/clubs/OccurrenceManager.tsx` - Uses inline grid instead of AttendanceSummary
- `components/clubs/AttendanceSummary.tsx` - Has guest count but not imported

**Recommended Fix:**
Replace the inline attendance grid in OccurrenceManager with the AttendanceSummary component, OR add a 5th box for "Guests" to the existing grid.

---

### Issue 3: Manual Check-In CORS Error

**Severity:** HIGH
**Status:** Open

**Description:** Clicking the green "Check In" button next to a participant's name fails with a CORS error.

**Error:**
```
Access to fetch at 'https://australia-southeast1-pickleball-app-test.cloudfunctions.net/standingMeetu...'
from origin 'https://pickleball-app-test.web.app' has been blocked by CORS policy:
Response to preflight request doesn't pass access control check:
No 'Access-Control-Allow-Origin' header is present on the requested resource.

POST https://australia-southeast1-pickleball-app-test.cloudfunctions.net/standingMeetu... net::ERR_FAILED
```

**Root Cause:**
The Cloud Function for manual participant check-in is missing CORS headers configuration.

**Affected Files:**
- `functions/src/standingMeetups.ts` - Cloud Function needs CORS configuration

**Recommended Fix:**
Add CORS middleware to the check-in Cloud Function:
```typescript
import * as cors from 'cors';
const corsHandler = cors({ origin: true });

// Wrap function with cors
export const standingMeetup_checkInManual = functions
  .region('australia-southeast1')
  .https.onCall(async (data, context) => {
    // ... existing code
  });
```

For `onCall` functions, ensure the function is properly exported and the Firebase SDK is configured correctly on the client.

---

### Issue 4: Profile Page Completely Inaccessible

**Severity:** CRITICAL
**Status:** Open (Related to Issue 1)

**Description:** The Profile page at `/#/profile` crashes immediately on load, showing "Unexpected Application Error".

**Error:**
```
TypeError: Cannot read properties of null (reading 'useMemo')
    at https://esm.sh/qrcode.react@4.2.0/...
```

**Root Cause:**
Same as Issue 1 - the `MyCheckInQR` component is rendered on the Profile page, causing the entire page to crash.

**Impact:** Users cannot:
- View their profile
- Edit their profile
- Access DUPR settings
- View their personal QR code

**Workaround:** Remove or conditionally render `MyCheckInQR` on the Profile page until Issue 1 is fixed.

---

## Summary of All Issues

| Issue | Severity | Component | Status |
|-------|----------|-----------|--------|
| 1. QR Code CDN Mismatch | CRITICAL | qrcode.react + React | Open |
| 2. Guest Count Not Displayed | HIGH | OccurrenceManager.tsx | Open |
| 3. Manual Check-In CORS Error | HIGH | Cloud Functions | Open |
| 4. Profile Page Inaccessible | CRITICAL | Profile + MyCheckInQR | Open (blocked by #1) |

---

## Working Features (Verified)

| Feature | Status | Notes |
|---------|--------|-------|
| Scan Player QR (Camera Scanner) | ✅ WORKING | jsQR library works correctly |
| Add Guest (Cash) Modal | ✅ WORKING | Modal opens, Cloud Function likely succeeds |
| Session Tools Buttons Display | ✅ WORKING | All 5 buttons visible |

---

**End of Fault Report**
