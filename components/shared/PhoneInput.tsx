/**
 * PhoneInput - Phone number input with country code selector
 *
 * Provides a user-friendly phone input with:
 * - Country code dropdown (NZ default)
 * - Auto-formatting as user types
 * - E.164 formatted output
 *
 * @version 06.18
 * @file components/shared/PhoneInput.tsx
 */

import React, { useState, useEffect } from 'react';

// Supported countries with their dial codes and formatting
const COUNTRY_CODES = [
  { code: 'NZ', dialCode: '+64', name: 'New Zealand', flag: '🇳🇿', placeholder: '21 123 4567', maxLength: 10 },
  { code: 'AU', dialCode: '+61', name: 'Australia', flag: '🇦🇺', placeholder: '412 345 678', maxLength: 10 },
  { code: 'US', dialCode: '+1', name: 'United States', flag: '🇺🇸', placeholder: '555 123 4567', maxLength: 10 },
  { code: 'UK', dialCode: '+44', name: 'United Kingdom', flag: '🇬🇧', placeholder: '7911 123456', maxLength: 11 },
] as const;

type CountryCode = typeof COUNTRY_CODES[number]['code'];

interface PhoneInputProps {
  value: string;
  onChange: (e164Value: string, rawValue: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  defaultCountry?: CountryCode;
}

/**
 * Format a raw phone number for display (add spaces)
 */
const formatForDisplay = (raw: string, countryCode: CountryCode): string => {
  const digits = raw.replace(/\D/g, '');

  if (countryCode === 'NZ') {
    // NZ: XX XXX XXXX or XXX XXX XXXX
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
    return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 9)}`;
  }

  if (countryCode === 'AU') {
    // AU: XXX XXX XXX
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
  }

  if (countryCode === 'US') {
    // US: (XXX) XXX-XXXX
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }

  if (countryCode === 'UK') {
    // UK: XXXX XXXXXX
    if (digits.length <= 4) return digits;
    return `${digits.slice(0, 4)} ${digits.slice(4, 10)}`;
  }

  return digits;
};

/**
 * Convert to E.164 format
 */
const toE164 = (raw: string, dialCode: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  // Remove leading 0 if present (common in NZ/UK/AU)
  const normalizedDigits = digits.startsWith('0') ? digits.slice(1) : digits;

  return `${dialCode}${normalizedDigits}`;
};

/**
 * Parse an E.164 number back to country and raw number
 */
const parseE164 = (e164: string): { countryCode: CountryCode; rawNumber: string } | null => {
  if (!e164 || !e164.startsWith('+')) return null;

  for (const country of COUNTRY_CODES) {
    if (e164.startsWith(country.dialCode)) {
      return {
        countryCode: country.code,
        rawNumber: e164.slice(country.dialCode.length),
      };
    }
  }

  return null;
};

export const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChange,
  placeholder,
  className = '',
  disabled = false,
  defaultCountry = 'NZ',
}) => {
  // Parse initial value if it's E.164 format
  const parsed = parseE164(value);
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(parsed?.countryCode || defaultCountry);
  const [rawNumber, setRawNumber] = useState(parsed?.rawNumber || '');

  const country = COUNTRY_CODES.find(c => c.code === selectedCountry)!;

  // Update raw number when external value changes
  useEffect(() => {
    const parsed = parseE164(value);
    if (parsed) {
      setSelectedCountry(parsed.countryCode);
      setRawNumber(parsed.rawNumber);
    } else if (!value) {
      setRawNumber('');
    }
  }, [value]);

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits
    const newRaw = e.target.value.replace(/\D/g, '').slice(0, country.maxLength);
    setRawNumber(newRaw);

    const e164 = toE164(newRaw, country.dialCode);
    onChange(e164, newRaw);
  };

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCountry = e.target.value as CountryCode;
    setSelectedCountry(newCountry);

    const newDialCode = COUNTRY_CODES.find(c => c.code === newCountry)!.dialCode;
    const e164 = toE164(rawNumber, newDialCode);
    onChange(e164, rawNumber);
  };

  const displayValue = formatForDisplay(rawNumber, selectedCountry);

  return (
    <div className={`flex gap-2 ${className}`}>
      {/* Country selector */}
      <select
        value={selectedCountry}
        onChange={handleCountryChange}
        disabled={disabled}
        className="bg-gray-700 text-white rounded-md px-2 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm min-w-[100px]"
      >
        {COUNTRY_CODES.map(c => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.dialCode}
          </option>
        ))}
      </select>

      {/* Phone number input */}
      <input
        type="tel"
        value={displayValue}
        onChange={handleNumberChange}
        placeholder={placeholder || country.placeholder}
        disabled={disabled}
        className="flex-grow bg-gray-700 text-white rounded-md px-4 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
      />
    </div>
  );
};

// Export helper functions for use elsewhere
export { toE164, parseE164, formatForDisplay, COUNTRY_CODES };
export type { CountryCode };
