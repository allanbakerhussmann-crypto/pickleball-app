/**
 * Tournament Planner - Main Container
 *
 * A step-by-step wizard that helps organizers plan their tournament
 * by calculating capacity, match counts, and time estimates.
 *
 * FILE LOCATION: components/tournament/planner/TournamentPlanner.tsx
 * VERSION: V06.00
 */

import React, { useState, useCallback, useMemo } from 'react';
import type {
  TournamentPlannerSettings,
  PlannerCapacity,
  TournamentDay,
} from '../../../types';
import {
  DEFAULT_TOURNAMENT_PLANNER_SETTINGS,
  MATCH_PRESETS,
  createDefaultTournamentDay,
} from '../../../types';
import { calculateTournamentCapacity } from '../../../services/plannerCalculations';

import { PlannerStep1Courts } from './PlannerStep1Courts';
import { PlannerStep2Time } from './PlannerStep2Time';
import { PlannerStep3Match } from './PlannerStep3Match';
import { PlannerStep4Divisions } from './PlannerStep4Divisions';
import { PlannerStep5Preview } from './PlannerStep5Preview';

interface TournamentPlannerProps {
  /** Initial settings (for editing existing tournament) */
  initialSettings?: TournamentPlannerSettings;
  /** Called when user completes the planner */
  onComplete: (settings: TournamentPlannerSettings, capacity: PlannerCapacity) => void;
  /** Called when user cancels */
  onCancel?: () => void;
}

const TOTAL_STEPS = 5;

export const TournamentPlanner: React.FC<TournamentPlannerProps> = ({
  initialSettings,
  onComplete,
  onCancel,
}) => {
  // Current step (1-5)
  const [step, setStep] = useState(1);

  // Planner settings
  const [settings, setSettings] = useState<TournamentPlannerSettings>(
    initialSettings || DEFAULT_TOURNAMENT_PLANNER_SETTINGS
  );

  // Calculate capacity whenever settings change
  const capacity = useMemo(() => {
    return calculateTournamentCapacity(settings);
  }, [settings]);

  // Navigation
  const handleNext = useCallback(() => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    }
  }, [step]);

  const handleBack = useCallback(() => {
    if (step > 1) {
      setStep(step - 1);
    }
  }, [step]);

  const handleComplete = useCallback(() => {
    onComplete(settings, capacity);
  }, [settings, capacity, onComplete]);

  // Settings updates
  const updateSettings = useCallback(
    (updates: Partial<TournamentPlannerSettings>) => {
      setSettings((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  // Handle division move (drag & drop in preview)
  const handleDivisionMove = useCallback(
    (divisionId: string, newStartTime: string, newDayId: string) => {
      setSettings((prev) => {
        const updatedDivisions = prev.divisions.map((div) => {
          if (div.id !== divisionId) return div;

          // Calculate duration to get new end time
          const parseTime = (time: string) => {
            const [h, m] = time.split(':').map(Number);
            return h * 60 + m;
          };
          const formatTime = (mins: number) => {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
          };

          const oldStart = parseTime(div.estimatedStartTime || '09:00');
          const oldEnd = parseTime(div.estimatedEndTime || '12:00');
          const duration = oldEnd - oldStart;
          const newStart = parseTime(newStartTime);
          const newEnd = newStart + duration;

          return {
            ...div,
            estimatedStartTime: newStartTime,
            estimatedEndTime: formatTime(newEnd),
            assignedDayId: newDayId,
          };
        });

        return { ...prev, divisions: updatedDivisions };
      });
    },
    []
  );

  // Render current step
  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <PlannerStep1Courts
            courts={settings.courts}
            onChange={(courts) => updateSettings({ courts })}
          />
        );
      case 2:
        return (
          <PlannerStep2Time
            days={settings.days}
            courts={settings.courts}
            onChange={(days: TournamentDay[]) => {
              // Update days and sync legacy startTime/endTime fields
              const firstDay = days[0];
              const lastDay = days[days.length - 1];
              updateSettings({
                days,
                startTime: firstDay?.startTime || '09:00',
                endTime: lastDay?.endTime || '17:00',
              });
            }}
          />
        );
      case 3:
        return (
          <PlannerStep3Match
            preset={settings.matchPreset}
            poolGameSettings={settings.poolGameSettings}
            medalGameSettings={settings.medalGameSettings}
            useSeparateMedalSettings={settings.useSeparateMedalSettings}
            timingSettings={settings.timingSettings}
            onPresetChange={(preset) => updateSettings({ matchPreset: preset })}
            onPoolGameSettingsChange={(poolGameSettings) =>
              updateSettings({ poolGameSettings, gameSettings: poolGameSettings })
            }
            onMedalGameSettingsChange={(medalGameSettings) =>
              updateSettings({ medalGameSettings })
            }
            onUseSeparateMedalSettingsChange={(useSeparateMedalSettings) =>
              updateSettings({ useSeparateMedalSettings })
            }
            onTimingSettingsChange={(timingSettings) => updateSettings({ timingSettings })}
          />
        );
      case 4:
        return (
          <PlannerStep4Divisions
            divisions={settings.divisions}
            capacity={capacity}
            onChange={(divisions) => updateSettings({ divisions })}
          />
        );
      case 5:
        return (
          <PlannerStep5Preview
            settings={settings}
            capacity={capacity}
            onDivisionMove={handleDivisionMove}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div>
              <h1 className="text-xl font-bold">Tournament Planner</h1>
              <p className="text-sm text-gray-400">
                Step {step} of {TOTAL_STEPS}
              </p>
            </div>
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-2">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  i + 1 === step
                    ? 'bg-blue-500'
                    : i + 1 < step
                    ? 'bg-green-500'
                    : 'bg-gray-600'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {renderStep()}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            {step > 1 ? (
              <button
                onClick={handleBack}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                ← Back
              </button>
            ) : onCancel ? (
              <button
                onClick={onCancel}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
            ) : null}
          </div>

          <div>
            {step < TOTAL_STEPS ? (
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={handleComplete}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  capacity.fitsInTimeframe
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                }`}
              >
                {capacity.fitsInTimeframe
                  ? 'Create Tournament →'
                  : 'Create Anyway →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TournamentPlanner;
