/**
 * DivisionTabs Component
 * 
 * Displays division selector tabs for tournament navigation.
 */

import React from 'react';
import type { Division } from '../../types';

interface DivisionTabsProps {
  divisions: Division[];
  activeDivisionId: string;
  onSelectDivision: (divisionId: string) => void;
}

export const DivisionTabs: React.FC<DivisionTabsProps> = ({
  divisions,
  activeDivisionId,
  onSelectDivision,
}) => {
  if (divisions.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      {/* Mobile Dropdown */}
      <div className="md:hidden">
        <label htmlFor="division-select" className="sr-only">
          Select Division
        </label>
        <select
          id="division-select"
          value={activeDivisionId}
          onChange={(e) => onSelectDivision(e.target.value)}
          className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg p-3 focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          {divisions.map((div) => (
            <option key={div.id} value={div.id}>
              {div.name}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop Tabs */}
      <div className="hidden md:flex gap-2 flex-wrap">
        {divisions.map((div) => (
          <button
            key={div.id}
            onClick={() => onSelectDivision(div.id)}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
              activeDivisionId === div.id
                ? 'bg-white text-gray-900 border-white'
                : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
            }`}
          >
            {div.name}
          </button>
        ))}
      </div>
    </div>
  );
};