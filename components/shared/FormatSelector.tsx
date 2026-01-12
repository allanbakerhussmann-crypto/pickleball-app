/**
 * Format Selector Component
 *
 * Shared dropdown for selecting competition formats.
 * Used in CreateTournament, CreateLeague, and CreateMeetup wizards.
 *
 * Filters available formats based on the selected play type.
 *
 * FILE LOCATION: components/shared/FormatSelector.tsx
 * VERSION: V06.00
 */

import React from 'react';
import type { CompetitionFormat, FormatOption } from '../../types/formats';
import type { PlayType } from '../../types/game';
import { COMPETITION_FORMATS, getFormatsForPlayType } from '../../types/formats';

// ============================================
// TYPES
// ============================================

interface FormatSelectorProps {
  /** Current selected format */
  value: CompetitionFormat | '';
  /** Handler when format changes */
  onChange: (format: CompetitionFormat) => void;
  /** Play type to filter formats (optional) */
  playType?: PlayType;
  /** Event type context (for context-specific disabling) */
  eventType?: 'tournament' | 'league' | 'meetup';
  /** Label text (default: "Competition Format") */
  label?: string;
  /** Show descriptions under each option */
  showDescriptions?: boolean;
  /** Error message to display */
  error?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** If true, show "Coming Soon" formats (app admin only) */
  isAppAdmin?: boolean;
}

// ============================================
// COMPONENT
// ============================================

export const FormatSelector: React.FC<FormatSelectorProps> = ({
  value,
  onChange,
  playType,
  eventType,
  label = 'Competition Format',
  showDescriptions = true,
  error,
  disabled = false,
  className = '',
  isAppAdmin = false,
}) => {
  // Get available formats based on play type
  const allFormats: FormatOption[] = playType
    ? getFormatsForPlayType(playType)
    : COMPETITION_FORMATS;

  // Filter out "Coming Soon" and "Admin Only" formats for non-admins (hide completely)
  const availableFormats = isAppAdmin
    ? allFormats
    : allFormats.filter(f => !f.comingSoon && !f.adminOnly);

  // Helper to check if format is disabled in current context
  const isFormatDisabled = (format: FormatOption): boolean => {
    if (format.comingSoon) return true; // Still disabled for admin, but visible
    if (eventType && format.disabledIn?.includes(eventType)) return true;
    return false;
  };

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value as CompetitionFormat;
    if (newValue) {
      onChange(newValue);
    }
  };

  // Find current format option for description
  const selectedFormat = availableFormats.find(f => f.value === value);

  return (
    <div className={`format-selector ${className}`}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>

      <select
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className={`
          w-full px-3 py-2 border rounded-lg
          focus:ring-2 focus:ring-green-500 focus:border-green-500
          disabled:bg-gray-100 disabled:cursor-not-allowed
          ${error ? 'border-red-500' : 'border-gray-300'}
        `}
      >
        <option value="">Select a format...</option>
        {availableFormats.map(format => {
          const formatDisabled = isFormatDisabled(format);
          return (
            <option
              key={format.value}
              value={format.value}
              disabled={formatDisabled}
            >
              {format.icon ? `${format.icon} ` : ''}{format.label}
              {formatDisabled ? ' (Coming Soon)' : ''}
            </option>
          );
        })}
      </select>

      {/* Description of selected format */}
      {showDescriptions && selectedFormat && (
        <p className="mt-1 text-sm text-gray-500">
          {selectedFormat.description}
          {selectedFormat.requiresTeams && (
            <span className="ml-1 text-orange-600">(requires pre-formed teams)</span>
          )}
        </p>
      )}

      {/* Error message */}
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}

      {/* No formats available message */}
      {playType && availableFormats.length === 0 && (
        <p className="mt-1 text-sm text-orange-600">
          No formats available for {playType} play type
        </p>
      )}
    </div>
  );
};

// ============================================
// FORMAT CARDS (Alternative UI)
// ============================================

interface FormatCardProps {
  format: FormatOption;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  /** Theme variant */
  theme?: 'light' | 'dark';
}

export const FormatCard: React.FC<FormatCardProps> = ({
  format,
  selected,
  onSelect,
  disabled = false,
  theme = 'light',
}) => {
  const isDark = theme === 'dark';
  const isDisabled = disabled || format.comingSoon;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isDisabled}
      className={`
        w-full p-4 text-left border-2 rounded-lg transition-all
        ${selected
          ? isDark
            ? 'border-blue-500 bg-blue-900/30'
            : 'border-green-500 bg-green-50'
          : isDark
            ? 'border-gray-700 bg-gray-900 hover:border-gray-600'
            : 'border-gray-200 hover:border-gray-300'
        }
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <div className="flex items-start gap-3">
        {format.icon && (
          <span className="text-2xl">{format.icon}</span>
        )}
        <div className="flex-1">
          <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {format.label}
          </h4>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {format.description}
          </p>
          {format.requiresTeams && (
            <span className={`inline-block mt-2 px-2 py-0.5 text-xs rounded ${
              isDark ? 'bg-orange-900/50 text-orange-400' : 'bg-orange-100 text-orange-700'
            }`}>
              Requires Teams
            </span>
          )}
          {format.comingSoon && (
            <span className={`inline-block mt-2 ml-1 px-2 py-0.5 text-xs rounded ${
              isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'
            }`}>
              Coming Soon
            </span>
          )}
        </div>
        {selected && (
          <svg className={`w-5 h-5 ${isDark ? 'text-blue-500' : 'text-green-500'}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        )}
      </div>
    </button>
  );
};

interface FormatCardsProps {
  value: CompetitionFormat | '';
  onChange: (format: CompetitionFormat) => void;
  playType?: PlayType;
  eventType?: 'tournament' | 'league' | 'meetup';
  disabled?: boolean;
  className?: string;
  /** Theme variant */
  theme?: 'light' | 'dark';
  /** If true, show "Coming Soon" formats (app admin only) */
  isAppAdmin?: boolean;
}

export const FormatCards: React.FC<FormatCardsProps> = ({
  value,
  onChange,
  playType,
  eventType,
  disabled = false,
  className = '',
  theme = 'light',
  isAppAdmin = false,
}) => {
  const allFormats = playType
    ? getFormatsForPlayType(playType)
    : COMPETITION_FORMATS;

  // Filter out "Coming Soon" and "Admin Only" formats for non-admins (hide completely)
  const availableFormats = isAppAdmin
    ? allFormats
    : allFormats.filter(f => !f.comingSoon && !f.adminOnly);

  // Helper to check if format is disabled in current context
  const isFormatDisabled = (format: FormatOption): boolean => {
    if (format.comingSoon) return true; // Still disabled for admin, but visible
    if (eventType && format.disabledIn?.includes(eventType)) return true;
    return false;
  };

  return (
    <div className={`grid gap-3 ${className}`}>
      {availableFormats.map(format => (
        <FormatCard
          key={format.value}
          format={format}
          selected={value === format.value}
          onSelect={() => onChange(format.value)}
          disabled={disabled || isFormatDisabled(format)}
          theme={theme}
        />
      ))}
    </div>
  );
};

export default FormatSelector;
