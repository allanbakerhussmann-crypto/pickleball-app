/**
 * Tournament Planner - Step 1: Courts
 *
 * User selects how many courts are available for the tournament.
 *
 * FILE LOCATION: components/tournament/planner/PlannerStep1Courts.tsx
 * VERSION: V06.00
 */

import React from 'react';

interface PlannerStep1CourtsProps {
  courts: number;
  onChange: (courts: number) => void;
}

const COURT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

export const PlannerStep1Courts: React.FC<PlannerStep1CourtsProps> = ({
  courts,
  onChange,
}) => {
  return (
    <div className="p-8">
      <div className="text-center mb-8">
        <span className="text-4xl mb-4 block">🏟️</span>
        <h2 className="text-2xl font-bold text-white mb-2">
          How many courts do you have?
        </h2>
        <p className="text-gray-400">
          This helps us calculate how many matches can run simultaneously
        </p>
      </div>

      {/* Court selection grid */}
      <div className="flex flex-wrap justify-center gap-4 mb-8">
        {COURT_OPTIONS.map((num) => (
          <button
            key={num}
            onClick={() => onChange(num)}
            className={`w-16 h-16 rounded-xl text-xl font-bold transition-all ${
              courts === num
                ? 'bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-800'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {num === 8 ? '8+' : num}
          </button>
        ))}
      </div>

      {/* Custom input for 8+ */}
      {courts >= 8 && (
        <div className="max-w-xs mx-auto mb-8">
          <label className="block text-sm text-gray-400 mb-2 text-center">
            Enter exact number of courts
          </label>
          <input
            type="number"
            min="8"
            max="50"
            value={courts}
            onChange={(e) => onChange(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white text-center text-xl focus:outline-none focus:border-blue-500"
          />
        </div>
      )}

      {/* Selected info */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 rounded-full">
          <span className="text-2xl font-bold text-white">{courts}</span>
          <span className="text-gray-400">
            {courts === 1 ? 'court' : 'courts'} selected
          </span>
        </div>
      </div>

      {/* Info box */}
      <div className="mt-8 p-4 bg-blue-900/30 border border-blue-800 rounded-lg">
        <div className="flex items-start gap-3">
          <span className="text-blue-400 text-lg">💡</span>
          <div className="text-sm text-blue-200">
            <p className="font-medium mb-1">Why does this matter?</p>
            <p className="text-blue-300/80">
              With {courts} court{courts !== 1 ? 's' : ''}, you can run {courts} match
              {courts !== 1 ? 'es' : ''} at the same time. More courts = shorter tournament
              duration, or capacity for more players.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlannerStep1Courts;
