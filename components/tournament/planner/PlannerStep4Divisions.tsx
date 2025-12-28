/**
 * Tournament Planner - Step 4: Divisions
 *
 * User adds and manages tournament divisions with live capacity feedback.
 *
 * FILE LOCATION: components/tournament/planner/PlannerStep4Divisions.tsx
 * VERSION: V06.00
 */

import React, { useState } from 'react';
import type { PlannerDivision, PlannerCapacity, TournamentPaymentMode } from '../../../types';
import { AddDivisionModal } from './AddDivisionModal';

interface PlannerStep4DivisionsProps {
  divisions: PlannerDivision[];
  capacity: PlannerCapacity;
  paymentMode?: TournamentPaymentMode;
  onChange: (divisions: PlannerDivision[]) => void;
}

export const PlannerStep4Divisions: React.FC<PlannerStep4DivisionsProps> = ({
  divisions,
  capacity,
  paymentMode,
  onChange,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDivision, setEditingDivision] = useState<PlannerDivision | null>(null);

  // Add new division
  const handleAddDivision = (division: PlannerDivision) => {
    onChange([...divisions, division]);
    setShowAddModal(false);
  };

  // Edit existing division
  const handleEditDivision = (division: PlannerDivision) => {
    onChange(divisions.map((d) => (d.id === division.id ? division : d)));
    setEditingDivision(null);
  };

  // Delete division
  const handleDeleteDivision = (id: string) => {
    onChange(divisions.filter((d) => d.id !== id));
  };

  // Get format display label
  const getFormatLabel = (format: string): string => {
    const labels: Record<string, string> = {
      pool_play_medals: 'Pool → Medals',
      round_robin: 'Round Robin',
      singles_elimination: 'Single Elim',
      doubles_elimination: 'Double Elim',
      swiss: 'Swiss',
      ladder: 'Ladder',
    };
    return labels[format] || format;
  };

  // Get gender display label
  const getGenderLabel = (gender?: string): string => {
    const labels: Record<string, string> = {
      men: 'Men',
      women: 'Women',
      mixed: 'Mixed',
      open: 'Open',
      mens: 'Men',
      womens: 'Women',
    };
    return labels[gender || 'open'] || 'Open';
  };

  // Get division breakdown from capacity
  const getDivisionStats = (divisionId: string) => {
    return capacity.divisionBreakdown.find((d) => d.divisionId === divisionId);
  };

  return (
    <div className="p-8">
      <div className="text-center mb-8">
        <span className="text-4xl mb-4 block">📋</span>
        <h2 className="text-2xl font-bold text-white mb-2">
          What divisions do you want?
        </h2>
        <p className="text-gray-400">
          Add your divisions and see capacity calculations update in real-time
        </p>
      </div>

      {/* Divisions list */}
      <div className="space-y-4 mb-6">
        {divisions.map((division) => {
          const stats = getDivisionStats(division.id);

          return (
            <div
              key={division.id}
              className="bg-gray-700 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">
                    {division.playType === 'singles' ? '👤' : '👥'}
                  </span>
                  <span className="font-medium text-white">{division.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingDivision(division)}
                    className="p-2 text-gray-400 hover:text-white transition-colors"
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteDivision(division.id)}
                    className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="px-3 py-1 bg-gray-600 rounded-full text-sm text-gray-300">
                  {getFormatLabel(division.format)}
                </div>
                <div className="px-3 py-1 bg-purple-900/50 rounded-full text-sm text-purple-300">
                  {getGenderLabel(division.gender)}
                </div>
                <div className="px-3 py-1 bg-gray-600 rounded-full text-sm text-gray-300">
                  {division.expectedPlayers}{' '}
                  {division.playType === 'singles' ? 'players' : 'teams'}
                </div>
                {/* DUPR Rating */}
                {(division.minRating || division.maxRating) && (
                  <div className="px-3 py-1 bg-blue-900/50 rounded-full text-sm text-blue-300">
                    DUPR: {division.minRating && division.maxRating
                      ? `${division.minRating.toFixed(1)}-${division.maxRating.toFixed(1)}`
                      : division.minRating
                      ? `${division.minRating.toFixed(1)}+`
                      : `Up to ${division.maxRating?.toFixed(1)}`
                    }
                  </div>
                )}
                {!division.minRating && !division.maxRating && (
                  <div className="px-3 py-1 bg-gray-600/50 rounded-full text-sm text-gray-400">
                    Open
                  </div>
                )}
                {stats && (
                  <>
                    <div className="px-3 py-1 bg-gray-600 rounded-full text-sm text-gray-300">
                      {stats.matches} matches
                    </div>
                    <div className="px-3 py-1 bg-gray-600 rounded-full text-sm text-gray-300">
                      ~{(stats.minutes / 60).toFixed(1)} hrs
                    </div>
                  </>
                )}
                {/* Entry fee display */}
                {division.entryFee && division.entryFee > 0 && (
                  <div className="px-3 py-1 bg-green-900/50 rounded-full text-sm text-green-300">
                    ${(division.entryFee / 100).toFixed(2)}
                  </div>
                )}
                {paymentMode === 'paid' && (!division.entryFee || division.entryFee === 0) && (
                  <div className="px-3 py-1 bg-gray-600/50 rounded-full text-sm text-gray-400">
                    Free entry
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Add division button */}
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full p-4 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors"
        >
          <span className="text-xl mr-2">➕</span>
          Add Division
        </button>
      </div>

      {/* Capacity meter */}
      {divisions.length > 0 && (
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400">📊 Capacity</span>
            <span className="text-white font-medium">{capacity.utilizationPercent}%</span>
          </div>

          {/* Progress bar */}
          <div className="h-3 bg-gray-600 rounded-full overflow-hidden mb-3">
            <div
              className={`h-full transition-all ${
                capacity.utilizationPercent > 100
                  ? 'bg-red-500'
                  : capacity.utilizationPercent > 80
                  ? 'bg-amber-500'
                  : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(capacity.utilizationPercent, 100)}%` }}
            />
          </div>

          {/* Stats */}
          <div className="flex items-center justify-center gap-6 text-sm">
            <div className="text-center">
              <div className="font-bold text-white">{capacity.totalPlayers}</div>
              <div className="text-gray-400">players</div>
            </div>
            <div className="text-gray-600">•</div>
            <div className="text-center">
              <div className="font-bold text-white">{capacity.totalMatches}</div>
              <div className="text-gray-400">matches</div>
            </div>
            <div className="text-gray-600">•</div>
            <div className="text-center">
              <div className="font-bold text-white">{capacity.totalHours.toFixed(1)}</div>
              <div className="text-gray-400">hours</div>
            </div>
          </div>

          {/* Status message */}
          <div className="mt-3 text-center">
            {capacity.fitsInTimeframe ? (
              <div className="text-green-400 text-sm">
                ✅ Fits comfortably!{' '}
                {capacity.suggestions.length > 0 && capacity.suggestions[0]}
              </div>
            ) : (
              <div className="text-amber-400 text-sm">
                ⚠️ {capacity.warningMessages[0]}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {divisions.length === 0 && (
        <div className="text-center p-8 bg-gray-700/50 rounded-lg">
          <span className="text-4xl mb-3 block">🏅</span>
          <p className="text-gray-400">
            No divisions yet. Click "Add Division" to get started.
          </p>
        </div>
      )}

      {/* Add Division Modal */}
      {showAddModal && (
        <AddDivisionModal
          onAdd={handleAddDivision}
          onClose={() => setShowAddModal(false)}
          paymentMode={paymentMode}
        />
      )}

      {/* Edit Division Modal */}
      {editingDivision && (
        <AddDivisionModal
          division={editingDivision}
          onAdd={handleEditDivision}
          onClose={() => setEditingDivision(null)}
          paymentMode={paymentMode}
        />
      )}
    </div>
  );
};

export default PlannerStep4Divisions;
