/**
 * Verification Settings Form V05.44
 *
 * Reusable form for configuring score verification settings.
 * Used in CreateLeague wizard Step 5 (Scoring) for ALL league formats.
 *
 * FILE LOCATION: components/leagues/verification/VerificationSettingsForm.tsx
 * VERSION: V05.44
 */

import React from 'react';
import type {
  ScoreEntryMode,
  ScoreVerificationMethod,
  ScoreVerificationSettings,
} from '../../../types';

interface VerificationSettingsFormProps {
  settings: ScoreVerificationSettings;
  onChange: (settings: ScoreVerificationSettings) => void;
  leagueFormat?: string; // Optional - for format-specific hints (reserved for future use)
}

/**
 * Entry mode options with descriptions
 */
const ENTRY_MODE_OPTIONS: { value: ScoreEntryMode; label: string; description: string }[] = [
  {
    value: 'any_player',
    label: 'Any Player',
    description: 'Any player in the match can enter the score',
  },
  {
    value: 'winner_only',
    label: 'Winner Only',
    description: 'Only the winning side can enter the score',
  },
  {
    value: 'organizer_only',
    label: 'Organizer Only',
    description: 'Only the organizer can enter scores',
  },
];

/**
 * Verification method options with descriptions
 */
const VERIFICATION_METHOD_OPTIONS: { value: ScoreVerificationMethod; label: string; description: string }[] = [
  {
    value: 'auto_confirm',
    label: 'Auto-Confirm',
    description: 'Scores are finalized immediately - no confirmation needed',
  },
  {
    value: 'one_opponent',
    label: 'One Opponent',
    description: 'One player from the opposing side must confirm (Recommended)',
  },
  {
    value: 'majority',
    label: 'Majority',
    description: '2 of 4 players (doubles) or 1 of 2 (singles) must confirm',
  },
  {
    value: 'organizer_only',
    label: 'Organizer Approval',
    description: 'All scores must be approved by the organizer',
  },
];

/**
 * Auto-finalize hour options
 */
const AUTO_FINALIZE_OPTIONS = [
  { value: 0, label: 'Disabled' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours (Recommended)' },
  { value: 48, label: '48 hours' },
  { value: 72, label: '72 hours' },
];

export const VerificationSettingsForm: React.FC<VerificationSettingsFormProps> = ({
  settings,
  onChange,
  leagueFormat: _leagueFormat, // Reserved for future format-specific hints
}) => {
  const updateSetting = <K extends keyof ScoreVerificationSettings>(
    key: K,
    value: ScoreVerificationSettings[K]
  ) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-6">
      {/* Entry Mode */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Who Can Enter Scores?
        </label>
        <div className="space-y-2">
          {ENTRY_MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                settings.entryMode === option.value
                  ? 'border-primary bg-primary/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <input
                type="radio"
                name="entryMode"
                value={option.value}
                checked={settings.entryMode === option.value}
                onChange={() => updateSetting('entryMode', option.value)}
                className="mt-1"
              />
              <div>
                <div className="text-white font-medium">{option.label}</div>
                <div className="text-sm text-gray-400">{option.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Verification Method */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Score Verification Method
        </label>
        <div className="space-y-2">
          {VERIFICATION_METHOD_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                settings.verificationMethod === option.value
                  ? 'border-primary bg-primary/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <input
                type="radio"
                name="verificationMethod"
                value={option.value}
                checked={settings.verificationMethod === option.value}
                onChange={() => updateSetting('verificationMethod', option.value)}
                className="mt-1"
              />
              <div>
                <div className="text-white font-medium">{option.label}</div>
                <div className="text-sm text-gray-400">{option.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Auto-Finalize */}
      {settings.verificationMethod !== 'auto_confirm' && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Auto-Finalize After
          </label>
          <select
            value={settings.autoFinalizeHours}
            onChange={(e) => updateSetting('autoFinalizeHours', parseInt(e.target.value))}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {AUTO_FINALIZE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            If no confirmation is received within this time, the score will be automatically finalized.
          </p>
        </div>
      )}

      {/* Allow Disputes */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.allowDisputes}
            onChange={(e) => updateSetting('allowDisputes', e.target.checked)}
            className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-primary focus:ring-primary"
          />
          <div>
            <div className="text-white font-medium">Allow Score Disputes</div>
            <div className="text-sm text-gray-400">
              Players can dispute scores if they believe there's an error
            </div>
          </div>
        </label>
      </div>

      {/* Info Box */}
      <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-300 mb-2">
          How Verification Works
        </h4>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>• Player enters score after match</li>
          <li>• Opponent(s) receive notification to confirm</li>
          <li>• Once confirmed, score is finalized and affects standings</li>
          <li>• Disputed matches are flagged for organizer review</li>
        </ul>
      </div>
    </div>
  );
};

/**
 * Compact version for inline editing
 */
export const VerificationSettingsCompact: React.FC<{
  settings: ScoreVerificationSettings;
  onChange: (settings: ScoreVerificationSettings) => void;
}> = ({ settings, onChange }) => {
  const updateSetting = <K extends keyof ScoreVerificationSettings>(
    key: K,
    value: ScoreVerificationSettings[K]
  ) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-4">
      {/* Entry Mode */}
      <div className="flex items-center gap-4">
        <label className="text-sm text-gray-400 w-32">Score Entry:</label>
        <select
          value={settings.entryMode}
          onChange={(e) => updateSetting('entryMode', e.target.value as ScoreEntryMode)}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-primary"
        >
          {ENTRY_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Verification Method */}
      <div className="flex items-center gap-4">
        <label className="text-sm text-gray-400 w-32">Verification:</label>
        <select
          value={settings.verificationMethod}
          onChange={(e) => updateSetting('verificationMethod', e.target.value as ScoreVerificationMethod)}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-primary"
        >
          {VERIFICATION_METHOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Auto-Finalize */}
      {settings.verificationMethod !== 'auto_confirm' && (
        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-400 w-32">Auto-finalize:</label>
          <select
            value={settings.autoFinalizeHours}
            onChange={(e) => updateSetting('autoFinalizeHours', parseInt(e.target.value))}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-primary"
          >
            {AUTO_FINALIZE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Allow Disputes */}
      <div className="flex items-center gap-4">
        <label className="text-sm text-gray-400 w-32">Disputes:</label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.allowDisputes}
            onChange={(e) => updateSetting('allowDisputes', e.target.checked)}
            className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-primary"
          />
          <span className="text-sm text-white">Allow players to dispute scores</span>
        </label>
      </div>
    </div>
  );
};

export default VerificationSettingsForm;
