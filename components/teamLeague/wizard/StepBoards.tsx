/**
 * StepBoards Component
 *
 * Step 2: Configure boards (matches per fixture).
 *
 * FILE LOCATION: components/teamLeague/wizard/StepBoards.tsx
 * VERSION: V07.54
 */

import React from 'react';
import type { TeamLeagueBoardConfig } from '../../../types/teamLeague';

export interface BoardsData {
  boards: TeamLeagueBoardConfig[];
  pointsPerBoardWin: number;
  pointsPerMatchWin: number;
}

interface StepBoardsProps {
  data: BoardsData;
  onChange: (data: BoardsData) => void;
  errors: Record<string, string>;
}

export const StepBoards: React.FC<StepBoardsProps> = ({
  data,
  onChange,
  errors,
}) => {
  // Get display name with numbering for duplicate board types
  // e.g., if there are 3 "Open Doubles", they become "Open Doubles 1", "Open Doubles 2", "Open Doubles 3"
  const getBoardDisplayName = (index: number): string => {
    const currentName = data.boards[index].name;
    const sameNameBoards = data.boards
      .map((b, i) => ({ name: b.name, index: i }))
      .filter(b => b.name === currentName);

    if (sameNameBoards.length === 1) {
      return currentName; // No numbering needed if only one
    }

    const position = sameNameBoards.findIndex(b => b.index === index) + 1;
    return `${currentName} ${position}`;
  };

  const handleBoardChange = (index: number, field: keyof TeamLeagueBoardConfig, value: string | number) => {
    const newBoards = [...data.boards];
    newBoards[index] = { ...newBoards[index], [field]: value };
    onChange({ ...data, boards: newBoards });
  };

  const addBoard = () => {
    const newId = `board_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newBoard: TeamLeagueBoardConfig = {
      id: newId,
      name: 'Open Doubles',
      format: 'doubles',
      order: data.boards.length + 1,
      pointValue: 1,
    };
    onChange({ ...data, boards: [...data.boards, newBoard] });
  };

  const removeBoard = (index: number) => {
    const newBoards = data.boards.filter((_, i) => i !== index);
    // Re-order remaining boards
    newBoards.forEach((b, i) => { b.order = i + 1; });
    onChange({ ...data, boards: newBoards });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Boards Configuration</h2>
        <p className="text-gray-400 text-sm">
          Each fixture (team vs team) consists of multiple boards.
          Configure the matches that make up each fixture.
        </p>
      </div>

      {/* Boards list */}
      <div className="space-y-3">
        {data.boards.map((board, index) => (
          <div
            key={board.id}
            className="bg-gray-800/50 border border-gray-700 rounded-lg p-4"
          >
            <div className="flex items-start gap-4">
              {/* Board number and display name */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-10 h-10 bg-amber-600/20 text-amber-400 rounded-lg flex items-center justify-center font-bold">
                  {index + 1}
                </div>
                <div className="text-sm text-gray-300 font-medium min-w-[120px]">
                  {getBoardDisplayName(index)}
                </div>
              </div>

              {/* Board config */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Name */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Board Name</label>
                  <select
                    value={board.name}
                    onChange={(e) => handleBoardChange(index, 'name', e.target.value)}
                    className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:border-amber-500 outline-none text-sm"
                  >
                    <option value="Open Doubles">Open Doubles</option>
                    <option value="Men's Doubles">Men's Doubles</option>
                    <option value="Women's Doubles">Women's Doubles</option>
                    <option value="Mixed Doubles">Mixed Doubles</option>
                    <option value="Open Singles">Open Singles</option>
                    <option value="Men's Singles">Men's Singles</option>
                    <option value="Women's Singles">Women's Singles</option>
                  </select>
                </div>

                {/* Format */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Format</label>
                  <select
                    value={board.format}
                    onChange={(e) => handleBoardChange(index, 'format', e.target.value)}
                    className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:border-amber-500 outline-none text-sm"
                  >
                    <option value="doubles">Doubles</option>
                    <option value="singles">Singles</option>
                    <option value="mixed">Mixed Doubles</option>
                  </select>
                </div>

                {/* Points */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Points for Win</label>
                  <input
                    type="number"
                    min="1"
                    value={board.pointValue || 1}
                    onChange={(e) => handleBoardChange(index, 'pointValue', parseInt(e.target.value) || 1)}
                    className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:border-amber-500 outline-none text-sm"
                  />
                </div>
              </div>

              {/* Remove button */}
              {data.boards.length > 1 && (
                <button
                  onClick={() => removeBoard(index)}
                  className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                  title="Remove board"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}

        {errors.boards && <p className="text-sm text-red-400">{errors.boards}</p>}
      </div>

      {/* Add board button */}
      <button
        onClick={addBoard}
        className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Board
      </button>

      {/* Bonus points section */}
      <div className="border-t border-gray-700 pt-6 mt-6">
        <h3 className="text-lg font-semibold text-white mb-4">Bonus Points</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Points for Winning Fixture
            </label>
            <input
              type="number"
              min="0"
              value={data.pointsPerMatchWin}
              onChange={(e) => onChange({ ...data, pointsPerMatchWin: parseInt(e.target.value) || 0 })}
              className="w-full bg-gray-800 text-white p-3 rounded-lg border border-gray-600 focus:border-amber-500 outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              Bonus points when a team wins more boards than the opponent
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Points per Board Win
            </label>
            <input
              type="number"
              min="0"
              value={data.pointsPerBoardWin}
              onChange={(e) => onChange({ ...data, pointsPerBoardWin: parseInt(e.target.value) || 0 })}
              className="w-full bg-gray-800 text-white p-3 rounded-lg border border-gray-600 focus:border-amber-500 outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              Points earned for each individual board won
            </p>
          </div>
        </div>

        {/* Points summary */}
        <div className="mt-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <h4 className="text-sm font-medium text-gray-300 mb-2">Points Example</h4>
          <p className="text-sm text-gray-400">
            If Team A wins 2 boards and Team B wins 1 board:
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            <li className="text-lime-400">
              Team A: {data.pointsPerMatchWin} (fixture win) + {2 * data.pointsPerBoardWin} (2 boards) = {data.pointsPerMatchWin + 2 * data.pointsPerBoardWin} points
            </li>
            <li className="text-gray-400">
              Team B: 0 (no fixture win) + {data.pointsPerBoardWin} (1 board) = {data.pointsPerBoardWin} point{data.pointsPerBoardWin !== 1 ? 's' : ''}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default StepBoards;
