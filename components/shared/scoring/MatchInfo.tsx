/**
 * MatchInfo Component
 *
 * Displays the match participants (Side A vs Side B) with highlighting for current user.
 *
 * @version V07.53
 * @file components/shared/scoring/MatchInfo.tsx
 */

import React from 'react';
import type { ScorableMatch } from '../../../types/game/scorableMatch';

interface MatchInfoProps {
  /** The match being scored */
  match: ScorableMatch;
  /** Whether current user is on Side A */
  isPlayerA: boolean;
  /** Whether current user is on Side B */
  isPlayerB: boolean;
}

export const MatchInfo: React.FC<MatchInfoProps> = ({
  match,
  isPlayerA,
  isPlayerB,
}) => {
  return (
    <div className="px-6 py-4 bg-gray-900/50 border-b border-gray-700">
      <div className="flex items-center justify-between text-center">
        <div className="flex-1">
          <div className={`font-semibold ${isPlayerA ? 'text-blue-400' : 'text-white'}`}>
            {match.sideA.name}
          </div>
          {isPlayerA && <div className="text-xs text-blue-400">(You)</div>}
        </div>
        <div className="px-4 text-gray-500 text-sm">vs</div>
        <div className="flex-1">
          <div className={`font-semibold ${isPlayerB ? 'text-blue-400' : 'text-white'}`}>
            {match.sideB.name}
          </div>
          {isPlayerB && <div className="text-xs text-blue-400">(You)</div>}
        </div>
      </div>
    </div>
  );
};

export default MatchInfo;
