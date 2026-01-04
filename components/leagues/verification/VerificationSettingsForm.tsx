/**
 * Verification Settings Form V07.12
 *
 * DUPR-compliant score verification settings.
 * Key principle: Players propose, Organisers finalise.
 *
 * Used in CreateLeague wizard Step 5 (Scoring) for ALL league formats.
 *
 * FILE LOCATION: components/leagues/verification/VerificationSettingsForm.tsx
 * VERSION: V07.12
 */

import React from 'react';
import type {
  ScoreEntryMode,
  ScoreVerificationMethod,
  ScoreVerificationSettings,
  LeagueDuprMode,
} from '../../../types';

interface VerificationSettingsFormProps {
  settings: ScoreVerificationSettings;
  onChange: (settings: ScoreVerificationSettings) => void;
  leagueFormat?: string; // Optional - for format-specific hints (reserved for future use)
  duprMode?: LeagueDuprMode; // V07.12 - Show DUPR compliance info when enabled
}

/**
 * Entry mode options - who can PROPOSE scores
 * V07.12: Renamed from "enter" to "propose" for DUPR compliance
 */
const ENTRY_MODE_OPTIONS: { value: ScoreEntryMode; label: string; description: string }[] = [
  {
    value: 'any_player',
    label: 'Players can propose scores',
    description: 'Any player in the match may submit a score proposal. Proposed scores are not official until approved by an organiser.',
  },
  {
    value: 'winner_only',
    label: 'Winning side can propose scores',
    description: 'Only a player on the winning side may submit a score proposal. Proposed scores are not official until approved by an organiser.',
  },
  {
    value: 'organizer_only',
    label: 'Organiser enters scores',
    description: 'Only the organiser can enter and finalise scores for this event.',
  },
];

/**
 * Player acknowledgement options (formerly "verification method")
 * V07.12: Reframed as acknowledgement that assists organiser review, not finalisation
 */
const ACKNOWLEDGEMENT_OPTIONS: { value: ScoreVerificationMethod; label: string; description: string; recommended?: boolean }[] = [
  {
    value: 'auto_confirm',
    label: 'No acknowledgement required (proposal only)',
    description: 'Score proposals can be submitted without opponent sign-off. Organiser finalises the official result.',
  },
  {
    value: 'one_opponent',
    label: 'Opponent acknowledgement (signature)',
    description: 'One opposing player may sign to acknowledge the proposed score. Assists organiser review.',
    recommended: true,
  },
  {
    value: 'majority',
    label: 'Majority acknowledgement',
    description: 'Two of four players (doubles) may acknowledge a proposed score. Assists organiser review.',
  },
  {
    value: 'organizer_only',
    label: 'Organiser enters and finalises',
    description: 'Only the organiser can enter scores. No player proposals.',
  },
];

/**
 * Escalate options (formerly "auto-finalize")
 * V07.12: Reframed as escalation to organiser, not auto-finalisation
 * Field name stays as autoFinalizeHours for backwards compatibility
 */
const ESCALATE_OPTIONS = [
  { value: 0, label: 'Never' },
  { value: 1, label: '1 hour' },
  { value: 6, label: '6 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours (Recommended)' },
];

export const VerificationSettingsForm: React.FC<VerificationSettingsFormProps> = ({
  settings,
  onChange,
  leagueFormat: _leagueFormat, // Reserved for future format-specific hints
  duprMode,
}) => {
  const updateSetting = <K extends keyof ScoreVerificationSettings>(
    key: K,
    value: ScoreVerificationSettings[K]
  ) => {
    onChange({ ...settings, [key]: value });
  };

  const isDuprEnabled = duprMode === 'optional' || duprMode === 'required';

  return (
    <div className="space-y-6">
      {/* DUPR Compliance Banner - V07.12 */}
      {isDuprEnabled && (
        <div className="bg-lime-900/20 border border-lime-600/30 rounded-lg p-4">
          <h4 className="text-sm font-medium text-lime-300 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            DUPR Compliance Active
          </h4>
          <ul className="text-sm text-gray-400 space-y-1">
            <li>• Players may propose and acknowledge scores</li>
            <li>• Only organisers can finalise official results</li>
            <li>• Only organiser-finalised results affect standings and can be submitted to DUPR</li>
          </ul>
        </div>
      )}

      {/* Entry Mode - Who Can Propose */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Who Can Propose Scores?
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

      {/* Player Acknowledgement (formerly Verification Method) */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Player Acknowledgement
        </label>
        <p className="text-xs text-gray-500 mb-2">
          How score proposals are collected before organiser review
        </p>
        <div className="space-y-2">
          {ACKNOWLEDGEMENT_OPTIONS.map((option) => (
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
                <div className="text-white font-medium">
                  {option.label}
                  {option.recommended && (
                    <span className="ml-2 text-xs text-lime-400">(Recommended)</span>
                  )}
                </div>
                <div className="text-sm text-gray-400">{option.description}</div>
              </div>
            </label>
          ))}
        </div>
        {/* DUPR note under acknowledgement section */}
        {isDuprEnabled && (
          <p className="text-xs text-gray-500 mt-2 italic">
            For DUPR compliance, all scores require organiser finalisation regardless of acknowledgement method.
          </p>
        )}
      </div>

      {/* Escalate to Organiser (formerly Auto-Finalize) */}
      {settings.verificationMethod !== 'auto_confirm' && settings.verificationMethod !== 'organizer_only' && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Escalate to organiser after
          </label>
          <select
            value={settings.autoFinalizeHours}
            onChange={(e) => updateSetting('autoFinalizeHours', parseInt(e.target.value))}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {ESCALATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            If a score proposal has not been finalised within this time, the match is flagged as "Needs review" and the organiser is notified.
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
              Players can dispute proposed scores if they believe there's an error
            </div>
          </div>
        </label>
      </div>

      {/* How Scoring Works Info Box - V07.12 Updated */}
      <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-300 mb-2">
          How scoring works in this event
        </h4>
        <ol className="text-sm text-gray-400 space-y-1 list-decimal list-inside">
          <li>A player submits a score proposal after the match</li>
          <li>An opposing player may sign to acknowledge the proposal, or dispute it</li>
          <li>The organiser reviews the proposal (and any dispute) and finalises the official result</li>
          <li>Only official results affect standings and bracket progression</li>
          {isDuprEnabled && (
            <li>If DUPR is enabled, only official organiser-finalised results can be submitted to DUPR</li>
          )}
        </ol>
      </div>
    </div>
  );
};

/**
 * Compact version for inline editing
 * V07.12: Updated labels to match full form
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
        <label className="text-sm text-gray-400 w-32">Who Proposes:</label>
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

      {/* Acknowledgement Method */}
      <div className="flex items-center gap-4">
        <label className="text-sm text-gray-400 w-32">Acknowledgement:</label>
        <select
          value={settings.verificationMethod}
          onChange={(e) => updateSetting('verificationMethod', e.target.value as ScoreVerificationMethod)}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-primary"
        >
          {ACKNOWLEDGEMENT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Escalate */}
      {settings.verificationMethod !== 'auto_confirm' && settings.verificationMethod !== 'organizer_only' && (
        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-400 w-32">Escalate after:</label>
          <select
            value={settings.autoFinalizeHours}
            onChange={(e) => updateSetting('autoFinalizeHours', parseInt(e.target.value))}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-primary"
          >
            {ESCALATE_OPTIONS.map((option) => (
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
          <span className="text-sm text-white">Allow players to dispute proposed scores</span>
        </label>
      </div>
    </div>
  );
};

export default VerificationSettingsForm;
