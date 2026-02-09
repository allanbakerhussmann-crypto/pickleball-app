# UI Input Patterns

## Time Format Standard

- **Storage**: 24-hour format (e.g., `"08:00"`, `"14:30"`)
- **Display**: 12-hour format with AM/PM (e.g., `"8:00 AM"`, `"2:30 PM"`)
- **Utility**: Use `utils/timeFormat.ts` for all time formatting
- **Components**: Use `ScrollTimePicker` for time input fields

### Time Utilities

```typescript
import { formatTime, formatTimeRange, formatTimestamp } from '../utils/timeFormat';

// Format "14:30" -> "2:30 PM"
formatTime('14:30')

// Format time range
formatTimeRange('08:00', '17:00')  // "8:00 AM - 5:00 PM"

// Format timestamp (milliseconds)
formatTimestamp(1703750400000)  // "8:00 AM"
```

---

## ScrollTimePicker Component

**ALWAYS use `ScrollTimePicker` for time input fields.** Never use `<input type="time">`.

```typescript
import { ScrollTimePicker } from '../shared/ScrollTimePicker';

<ScrollTimePicker
  value={startTime}        // "HH:MM" 24-hour format (e.g., "18:00")
  onChange={setStartTime}  // Receives "HH:MM" 24-hour format
  label="Start Time"
/>
```

### Features

- Plus/minus buttons for 15-minute increments
- Displays time in 12-hour format (e.g., "6:00 PM")
- Stores/returns 24-hour format for consistency
- Dark theme styling (gray-800, lime-500 accent)
- Mobile-friendly touch targets

---

## Price Input Pattern

**Use plus/minus button controls for price inputs** instead of `<input type="number">`.

```tsx
// Price picker with $0.50 increments
<div className="flex items-center gap-2">
  <button
    type="button"
    onClick={() => {
      const current = parseFloat(price) || 1;
      const newAmount = Math.max(1, current - 0.5);
      setPrice(newAmount.toFixed(2));
    }}
    className="w-12 h-12 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-2xl font-bold"
  >
    −
  </button>
  <div className="flex-1 h-12 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
    <span className="text-lime-400 text-xl font-bold font-mono">
      ${parseFloat(price).toFixed(2)}
    </span>
  </div>
  <button
    type="button"
    onClick={() => {
      const current = parseFloat(price) || 1;
      const newAmount = Math.min(100, current + 0.5);
      setPrice(newAmount.toFixed(2));
    }}
    className="w-12 h-12 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-2xl font-bold"
  >
    +
  </button>
</div>
```

### Guidelines

- Use $0.50 increments (configurable based on context)
- Minimum $1.00, Maximum $100.00 (adjust as needed)
- Display with 2 decimal places (e.g., "$15.00")
- Use lime-400 for the displayed amount
- Dark theme styling consistent with ScrollTimePicker

---

## PhoneInput Component

Reusable component with country code selector:

```typescript
import { PhoneInput } from '../shared/PhoneInput';

<PhoneInput
  value={phone}
  onChange={(e164Value) => setPhone(e164Value)}
  defaultCountry="NZ"
/>
```

### Supported Countries

| Country | Code |
|---------|------|
| NZ | +64 (Default) |
| AU | +61 |
| US | +1 |
| UK | +44 |

Auto-formats numbers as user types, outputs E.164 format (e.g., `+64211234567`).
