/**
 * Game Settings Form Component
 *
 * Universal form for configuring game/match settings:
 * - Play type (singles, doubles, mixed, open)
 * - Points per game (11, 15, 21)
 * - Win by (1 or 2)
 * - Best of (1, 3, or 5)
 * - Cap at (optional)
 *
 * FILE LOCATION: components/shared/GameSettingsForm.tsx
 * VERSION: V06.00
 */

import React from 'react';
import type { GameSettings, PlayType, PointsPerGame, WinBy, BestOf } from '../../types/game';
import {
  PLAY_TYPE_OPTIONS,
  POINTS_PER_GAME_OPTIONS,
  WIN_BY_OPTIONS,
  BEST_OF_OPTIONS,
  GAME_SETTINGS_PRESETS,
} from '../../types/game';

// ============================================
// TYPES
// ============================================

interface GameSettingsFormProps {
  /** Current settings */
  value: GameSettings;
  /** Handler when settings change */
  onChange: (settings: GameSettings) => void;
  /** Which fields to show (default: all) */
  showFields?: ('playType' | 'pointsPerGame' | 'winBy' | 'bestOf' | 'capAt')[];
  /** Compact mode (inline layout) */
  compact?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ============================================
// COMPONENT
// ============================================

export const GameSettingsForm: React.FC<GameSettingsFormProps> = ({
  value,
  onChange,
  showFields = ['playType', 'pointsPerGame', 'winBy', 'bestOf'],
  compact = false,
  disabled = false,
  className = '',
}) => {
  const handleChange = <K extends keyof GameSettings>(
    field: K,
    newValue: GameSettings[K]
  ) => {
    onChange({ ...value, [field]: newValue });
  };

  const showField = (field: string) => showFields.includes(field as any);

  if (compact) {
    return (
      <div className={`flex flex-wrap gap-4 ${className}`}>
        {showField('playType') && (
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-gray-500 mb-1">Play Type</label>
            <select
              value={value.playType}
              onChange={e => handleChange('playType', e.target.value as PlayType)}
              disabled={disabled}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-green-500"
            >
              {PLAY_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        {showField('pointsPerGame') && (
          <div className="flex-1 min-w-[100px]">
            <label className="block text-xs text-gray-500 mb-1">Points</label>
            <select
              value={value.pointsPerGame}
              onChange={e => handleChange('pointsPerGame', Number(e.target.value) as PointsPerGame)}
              disabled={disabled}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-green-500"
            >
              {POINTS_PER_GAME_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        {showField('winBy') && (
          <div className="flex-1 min-w-[100px]">
            <label className="block text-xs text-gray-500 mb-1">Win By</label>
            <select
              value={value.winBy}
              onChange={e => handleChange('winBy', Number(e.target.value) as WinBy)}
              disabled={disabled}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-green-500"
            >
              {WIN_BY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        {showField('bestOf') && (
          <div className="flex-1 min-w-[100px]">
            <label className="block text-xs text-gray-500 mb-1">Best Of</label>
            <select
              value={value.bestOf}
              onChange={e => handleChange('bestOf', Number(e.target.value) as BestOf)}
              disabled={disabled}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-green-500"
            >
              {BEST_OF_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  }

  // Full form layout
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Play Type */}
      {showField('playType') && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Play Type
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {PLAY_TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleChange('playType', opt.value)}
                disabled={disabled}
                className={`
                  px-3 py-2 text-sm border rounded-lg transition-colors
                  ${value.playType === opt.value
                    ? 'bg-green-500 text-white border-green-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-green-500'
                  }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {value.playType && PLAY_TYPE_OPTIONS.find(o => o.value === value.playType)?.description && (
            <p className="mt-1 text-xs text-gray-500">
              {PLAY_TYPE_OPTIONS.find(o => o.value === value.playType)?.description}
            </p>
          )}
        </div>
      )}

      {/* Points Per Game */}
      {showField('pointsPerGame') && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Points Per Game
          </label>
          <div className="flex gap-2">
            {POINTS_PER_GAME_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleChange('pointsPerGame', opt.value)}
                disabled={disabled}
                className={`
                  flex-1 px-3 py-2 text-sm border rounded-lg transition-colors
                  ${value.pointsPerGame === opt.value
                    ? 'bg-green-500 text-white border-green-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-green-500'
                  }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                {opt.value}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Win By */}
      {showField('winBy') && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Win By
          </label>
          <div className="flex gap-2">
            {WIN_BY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleChange('winBy', opt.value)}
                disabled={disabled}
                className={`
                  flex-1 px-3 py-2 text-sm border rounded-lg transition-colors
                  ${value.winBy === opt.value
                    ? 'bg-green-500 text-white border-green-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-green-500'
                  }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Best Of */}
      {showField('bestOf') && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Match Format
          </label>
          <div className="flex gap-2">
            {BEST_OF_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleChange('bestOf', opt.value)}
                disabled={disabled}
                className={`
                  flex-1 px-3 py-2 text-sm border rounded-lg transition-colors
                  ${value.bestOf === opt.value
                    ? 'bg-green-500 text-white border-green-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-green-500'
                  }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cap At (optional) */}
      {showField('capAt') && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Score Cap (Deuce Limit)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.capAt !== undefined}
              onChange={e => {
                if (e.target.checked) {
                  handleChange('capAt', value.pointsPerGame + 4);
                } else {
                  const newSettings = { ...value };
                  delete newSettings.capAt;
                  onChange(newSettings);
                }
              }}
              disabled={disabled}
              className="w-4 h-4 text-green-500 rounded border-gray-300 focus:ring-green-500"
            />
            <span className="text-sm text-gray-600">Enable score cap</span>
            {value.capAt !== undefined && (
              <input
                type="number"
                value={value.capAt}
                onChange={e => handleChange('capAt', Number(e.target.value))}
                disabled={disabled}
                min={value.pointsPerGame}
                max={value.pointsPerGame + 10}
                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-green-500"
              />
            )}
          </div>
          {value.capAt !== undefined && (
            <p className="mt-1 text-xs text-gray-500">
              Game ends at {value.capAt}-{value.capAt - 1} even without win-by-{value.winBy} margin
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// PRESET SELECTOR
// ============================================

interface PresetSelectorProps {
  onSelect: (settings: GameSettings) => void;
  disabled?: boolean;
}

export const GameSettingsPresets: React.FC<PresetSelectorProps> = ({
  onSelect,
  disabled = false,
}) => {
  const presets = [
    { key: 'casual', label: 'Casual', desc: 'Single game to 11' },
    { key: 'competitive', label: 'Competitive', desc: 'Best of 3 to 11' },
    { key: 'finals', label: 'Finals', desc: 'Best of 3 to 15' },
    { key: 'championship', label: 'Championship', desc: 'Best of 5 to 11' },
  ] as const;

  return (
    <div className="flex flex-wrap gap-2">
      {presets.map(preset => (
        <button
          key={preset.key}
          type="button"
          onClick={() => onSelect(GAME_SETTINGS_PRESETS[preset.key] as GameSettings)}
          disabled={disabled}
          className={`
            px-3 py-1.5 text-sm border border-gray-300 rounded-full
            hover:border-green-500 hover:bg-green-50 transition-colors
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
};

export default GameSettingsForm;
