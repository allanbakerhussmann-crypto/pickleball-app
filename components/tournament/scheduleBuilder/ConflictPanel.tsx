/**
 * Schedule Builder - Conflict Panel
 *
 * Displays scheduling conflicts with resolution options.
 *
 * FILE LOCATION: components/tournament/scheduleBuilder/ConflictPanel.tsx
 * VERSION: V06.00
 */

import React from 'react';
import type { ScheduleConflict } from '../../../types';

interface ConflictPanelProps {
  conflicts: ScheduleConflict[];
  onIgnore: (conflictId: string) => void;
  onAutoFix: (conflictId: string) => void;
}

const CONFLICT_ICONS: Record<string, string> = {
  player_double_booked: '👤',
  court_double_booked: '🏟️',
  insufficient_rest: '⏰',
  bracket_dependency: '🔗',
};

const CONFLICT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  error: {
    bg: 'bg-red-900/30',
    border: 'border-red-700',
    text: 'text-red-400',
  },
  warning: {
    bg: 'bg-amber-900/30',
    border: 'border-amber-700',
    text: 'text-amber-400',
  },
};

export const ConflictPanel: React.FC<ConflictPanelProps> = ({
  conflicts,
  onIgnore,
  onAutoFix,
}) => {
  // Filter out ignored conflicts
  const activeConflicts = conflicts.filter((c) => !c.ignored);
  const ignoredConflicts = conflicts.filter((c) => c.ignored);

  const errorCount = activeConflicts.filter((c) => c.severity === 'error').length;
  const warningCount = activeConflicts.filter((c) => c.severity === 'warning').length;

  if (conflicts.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <h3 className="font-medium text-white">Conflicts</h3>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {errorCount > 0 && (
            <span className="px-2 py-1 bg-red-900/50 text-red-400 rounded">
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
          {warningCount > 0 && (
            <span className="px-2 py-1 bg-amber-900/50 text-amber-400 rounded">
              {warningCount} warning{warningCount !== 1 ? 's' : ''}
            </span>
          )}
          {ignoredConflicts.length > 0 && (
            <span className="px-2 py-1 bg-gray-700 text-gray-400 rounded">
              {ignoredConflicts.length} ignored
            </span>
          )}
        </div>
      </div>

      {/* Active conflicts */}
      <div className="space-y-3">
        {activeConflicts.map((conflict) => {
          const colors = CONFLICT_COLORS[conflict.severity];
          const icon = CONFLICT_ICONS[conflict.type] || '⚠️';

          return (
            <div
              key={conflict.id}
              className={`p-3 rounded-lg border ${colors.bg} ${colors.border}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">{icon}</span>
                  <div>
                    <p className={`font-medium ${colors.text}`}>
                      {conflict.message}
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      At {conflict.scheduledTime}
                      {conflict.matchIds.length > 0 && (
                        <> • {conflict.matchIds.length} match{conflict.matchIds.length !== 1 ? 'es' : ''} affected</>
                      )}
                    </p>
                    {conflict.autoFixDescription && conflict.canAutoFix && (
                      <p className="text-xs text-gray-500 mt-1">
                        💡 {conflict.autoFixDescription}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {conflict.canAutoFix && (
                    <button
                      onClick={() => onAutoFix(conflict.id)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                    >
                      Auto-Fix
                    </button>
                  )}
                  <button
                    onClick={() => onIgnore(conflict.id)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors"
                  >
                    Ignore
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ignored conflicts (collapsed) */}
      {ignoredConflicts.length > 0 && (
        <details className="mt-4">
          <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300">
            {ignoredConflicts.length} ignored conflict{ignoredConflicts.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-2">
            {ignoredConflicts.map((conflict) => (
              <div
                key={conflict.id}
                className="p-2 rounded bg-gray-700/50 text-sm text-gray-400"
              >
                {CONFLICT_ICONS[conflict.type]} {conflict.message}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* All clear message */}
      {activeConflicts.length === 0 && (
        <div className="text-center py-4 text-green-400">
          ✅ All conflicts resolved!
        </div>
      )}
    </div>
  );
};

export default ConflictPanel;
