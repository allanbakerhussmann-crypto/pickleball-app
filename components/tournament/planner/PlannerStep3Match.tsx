/**
 * Tournament Planner - Step 3: Match Settings
 *
 * User selects match format (presets) with separate pool/medal configurations.
 *
 * FILE LOCATION: components/tournament/planner/PlannerStep3Match.tsx
 * VERSION: V06.00
 */

import React, { useState, useMemo } from 'react';
import type { MatchPreset, PlannerGameSettings, PlannerTimingSettings } from '../../../types';
import { MATCH_PRESETS } from '../../../types';
import { calculateSlotDuration } from '../../../services/plannerCalculations';

interface PlannerStep3MatchProps {
  preset: MatchPreset;
  poolGameSettings: PlannerGameSettings;
  medalGameSettings: PlannerGameSettings;
  useSeparateMedalSettings: boolean;
  timingSettings: PlannerTimingSettings;
  onPresetChange: (preset: MatchPreset) => void;
  onPoolGameSettingsChange: (settings: PlannerGameSettings) => void;
  onMedalGameSettingsChange: (settings: PlannerGameSettings) => void;
  onUseSeparateMedalSettingsChange: (use: boolean) => void;
  onTimingSettingsChange: (settings: PlannerTimingSettings) => void;
}

const PRESET_ICONS: Record<MatchPreset, string> = {
  quick: '☕',
  standard: '🎯',
  finals: '🏆',
  custom: '⚙️',
};

// Reusable game settings editor
const GameSettingsEditor: React.FC<{
  settings: PlannerGameSettings;
  onChange: (settings: PlannerGameSettings) => void;
  label: string;
  showIcon?: string;
}> = ({ settings, onChange, label, showIcon }) => (
  <div className="space-y-4">
    {showIcon && (
      <div className="flex items-center gap-2 text-white font-medium">
        <span>{showIcon}</span>
        <span>{label}</span>
      </div>
    )}

    {/* Points to Win */}
    <div>
      <label className="block text-xs text-gray-400 mb-1">Points to Win</label>
      <div className="flex gap-1">
        {([11, 15, 21] as const).map((pts) => (
          <button
            key={pts}
            onClick={() => onChange({ ...settings, pointsToWin: pts })}
            className={`flex-1 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              settings.pointsToWin === pts
                ? 'bg-blue-600 text-white'
                : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
            }`}
          >
            {pts}
          </button>
        ))}
      </div>
    </div>

    {/* Win By */}
    <div>
      <label className="block text-xs text-gray-400 mb-1">Win By</label>
      <div className="flex gap-1">
        {([1, 2] as const).map((margin) => (
          <button
            key={margin}
            onClick={() => onChange({ ...settings, winBy: margin })}
            className={`flex-1 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              settings.winBy === margin
                ? 'bg-blue-600 text-white'
                : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
            }`}
          >
            {margin}
          </button>
        ))}
      </div>
    </div>

    {/* Best Of */}
    <div>
      <label className="block text-xs text-gray-400 mb-1">Games</label>
      <div className="flex gap-1">
        {([1, 3, 5] as const).map((games) => (
          <button
            key={games}
            onClick={() => onChange({ ...settings, bestOf: games })}
            className={`flex-1 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              settings.bestOf === games
                ? 'bg-blue-600 text-white'
                : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
            }`}
          >
            {games === 1 ? '1' : `Bo${games}`}
          </button>
        ))}
      </div>
    </div>
  </div>
);

// Format game settings for display
const formatGameSettings = (settings: PlannerGameSettings): string => {
  const games = settings.bestOf === 1 ? '1 game' : `Best of ${settings.bestOf}`;
  return `${games} to ${settings.pointsToWin}, win by ${settings.winBy}`;
};

export const PlannerStep3Match: React.FC<PlannerStep3MatchProps> = ({
  preset,
  poolGameSettings,
  medalGameSettings,
  useSeparateMedalSettings,
  timingSettings,
  onPresetChange,
  onPoolGameSettingsChange,
  onMedalGameSettingsChange,
  onUseSeparateMedalSettingsChange,
  onTimingSettingsChange,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Calculate slot durations for pool and medal matches
  const poolSlotDuration = useMemo(() => {
    return calculateSlotDuration(poolGameSettings, timingSettings);
  }, [poolGameSettings, timingSettings]);

  const medalSlotDuration = useMemo(() => {
    return calculateSlotDuration(medalGameSettings, timingSettings);
  }, [medalGameSettings, timingSettings]);

  // Handle preset change - apply to both pool and medal settings
  const handlePresetChange = (newPreset: MatchPreset) => {
    const presetConfig = MATCH_PRESETS[newPreset];
    onPresetChange(newPreset);
    onPoolGameSettingsChange(presetConfig.poolGameSettings);
    onMedalGameSettingsChange(presetConfig.medalGameSettings);
    onUseSeparateMedalSettingsChange(presetConfig.useSeparateMedalSettings);
  };

  return (
    <div className="p-8">
      <div className="text-center mb-8">
        <span className="text-4xl mb-4 block">🎯</span>
        <h2 className="text-2xl font-bold text-white mb-2">
          How do you want matches played?
        </h2>
        <p className="text-gray-400">
          Choose a preset - pool play and medal rounds can have different settings
        </p>
      </div>

      {/* Preset cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {(Object.keys(MATCH_PRESETS) as MatchPreset[]).map((presetKey) => {
          const config = MATCH_PRESETS[presetKey];
          const isSelected = preset === presetKey;

          return (
            <button
              key={presetKey}
              onClick={() => handlePresetChange(presetKey)}
              className={`p-4 rounded-xl text-center transition-all ${
                isSelected
                  ? 'bg-blue-600 ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-800'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              <div className="text-2xl mb-2">{PRESET_ICONS[presetKey]}</div>
              <div className="font-bold text-white mb-1">{config.label}</div>
              <div className="text-xs text-gray-300 mb-2">{config.description}</div>
            </button>
          );
        })}
      </div>

      {/* Pool vs Medal Settings Display */}
      <div className="bg-gray-700 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-gray-400">Different settings for medal rounds?</span>
            <button
              onClick={() => {
                onUseSeparateMedalSettingsChange(!useSeparateMedalSettings);
                if (!useSeparateMedalSettings) {
                  // Switching ON - keep current settings
                } else {
                  // Switching OFF - sync medal to pool
                  onMedalGameSettingsChange(poolGameSettings);
                }
                onPresetChange('custom');
              }}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                useSeparateMedalSettings ? 'bg-blue-600' : 'bg-gray-500'
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  useSeparateMedalSettings ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            {showAdvanced ? 'Hide Details ▲' : 'Edit Details ▼'}
          </button>
        </div>

        {/* Settings summary */}
        <div className={`grid ${useSeparateMedalSettings ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
          {/* Pool Play */}
          <div className={`p-3 rounded-lg ${useSeparateMedalSettings ? 'bg-gray-600' : 'bg-gray-600'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🏐</span>
              <span className="font-medium text-white">
                {useSeparateMedalSettings ? 'Pool Play' : 'All Matches'}
              </span>
            </div>
            <div className="text-sm text-gray-300">
              {formatGameSettings(poolGameSettings)}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              ~{poolSlotDuration} min per match
            </div>
          </div>

          {/* Medal Rounds */}
          {useSeparateMedalSettings && (
            <div className="p-3 rounded-lg bg-amber-900/30 border border-amber-700/50">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🏆</span>
                <span className="font-medium text-white">Medal Rounds</span>
              </div>
              <div className="text-sm text-amber-200">
                {formatGameSettings(medalGameSettings)}
              </div>
              <div className="text-xs text-amber-300/70 mt-1">
                ~{medalSlotDuration} min per match
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Advanced settings (expanded) */}
      {showAdvanced && (
        <div className="space-y-6 mb-6">
          {/* Game Settings */}
          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="font-medium text-white mb-4">Scoring Settings</h3>

            <div className={`grid ${useSeparateMedalSettings ? 'grid-cols-2' : 'grid-cols-1'} gap-6`}>
              {/* Pool Play Settings */}
              <div className={useSeparateMedalSettings ? 'pr-4 border-r border-gray-600' : ''}>
                <GameSettingsEditor
                  settings={poolGameSettings}
                  onChange={(s) => {
                    onPoolGameSettingsChange(s);
                    if (!useSeparateMedalSettings) {
                      onMedalGameSettingsChange(s);
                    }
                    onPresetChange('custom');
                  }}
                  label={useSeparateMedalSettings ? 'Pool Play' : 'All Matches'}
                  showIcon={useSeparateMedalSettings ? '🏐' : undefined}
                />
              </div>

              {/* Medal Round Settings */}
              {useSeparateMedalSettings && (
                <div>
                  <GameSettingsEditor
                    settings={medalGameSettings}
                    onChange={(s) => {
                      onMedalGameSettingsChange(s);
                      onPresetChange('custom');
                    }}
                    label="Medal Rounds"
                    showIcon="🏆"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Timing Settings */}
          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="font-medium text-white mb-4">Timing Settings</h3>

            <div className="space-y-4">
              {/* Warmup */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Warmup Time</span>
                  <span className="text-white">{timingSettings.warmupMinutes} min</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={timingSettings.warmupMinutes}
                  onChange={(e) =>
                    onTimingSettingsChange({
                      ...timingSettings,
                      warmupMinutes: parseInt(e.target.value),
                    })
                  }
                  className="w-full accent-blue-500"
                />
              </div>

              {/* Rest */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Rest Between Matches</span>
                  <span className="text-white">{timingSettings.restMinutes} min</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={timingSettings.restMinutes}
                  onChange={(e) =>
                    onTimingSettingsChange({
                      ...timingSettings,
                      restMinutes: parseInt(e.target.value),
                    })
                  }
                  className="w-full accent-blue-500"
                />
              </div>

              {/* Court Change */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Court Transition</span>
                  <span className="text-white">{timingSettings.courtChangeMinutes} min</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={timingSettings.courtChangeMinutes}
                  onChange={(e) =>
                    onTimingSettingsChange({
                      ...timingSettings,
                      courtChangeMinutes: parseInt(e.target.value),
                    })
                  }
                  className="w-full accent-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slot duration summary */}
      <div className="text-center p-4 bg-gray-700 rounded-lg">
        {useSeparateMedalSettings ? (
          <div className="flex items-center justify-center gap-6">
            <div>
              <span className="text-gray-400">🏐 Pool:</span>
              <span className="text-lg font-bold text-white ml-2">{poolSlotDuration} min</span>
            </div>
            <div className="text-gray-600">•</div>
            <div>
              <span className="text-gray-400">🏆 Medals:</span>
              <span className="text-lg font-bold text-amber-300 ml-2">{medalSlotDuration} min</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <span className="text-gray-400">⏱️</span>
            <span className="text-gray-400">Each match slot =</span>
            <span className="text-xl font-bold text-white">{poolSlotDuration} minutes</span>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-1">
          (match time + warmup + rest + transition)
        </p>
      </div>
    </div>
  );
};

export default PlannerStep3Match;
