/**
 * StepReview Component
 *
 * Step 5: Review all settings before creating the league.
 *
 * FILE LOCATION: components/teamLeague/wizard/StepReview.tsx
 * VERSION: V07.56
 */

import React from 'react';
import type { BasicInfoData } from './StepBasicInfo';
import type { BoardsData } from './StepBoards';
import type { RosterData } from './StepRoster';
import type { ScheduleData } from './StepSchedule';

interface StepReviewProps {
  basicInfo: BasicInfoData;
  boards: BoardsData;
  roster: RosterData;
  schedule: ScheduleData;
  onEditStep: (step: number) => void;
  isSubmitting: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const formatTime = (time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-NZ', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const calculateEndDate = (startDate: string, weeks: number): string => {
  if (!startDate || !weeks) return '';
  const start = new Date(startDate);
  start.setDate(start.getDate() + (weeks * 7));
  return start.toISOString().split('T')[0];
};

const formatAmount = (cents: number): string => {
  if (!cents || cents === 0) return '$0.00';
  return `$${(cents / 100).toFixed(2)}`;
};

export const StepReview: React.FC<StepReviewProps> = ({
  basicInfo,
  boards,
  roster,
  schedule,
  onEditStep,
  isSubmitting,
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Review & Create</h2>
        <p className="text-gray-400 text-sm">Review your settings before creating the league.</p>
      </div>

      {/* Basic Info Summary */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            League Info
          </h3>
          <button
            type="button"
            onClick={() => onEditStep(0)}
            disabled={isSubmitting}
            className="text-amber-400 hover:text-amber-300 text-sm font-medium disabled:opacity-50"
          >
            Edit
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Name</span>
            <span className="text-white font-medium">{basicInfo.name || 'Not set'}</span>
          </div>
          {basicInfo.description && (
            <div className="flex justify-between">
              <span className="text-gray-400">Description</span>
              <span className="text-white text-right max-w-xs truncate">{basicInfo.description}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-400">Season</span>
            <span className="text-white">
              {basicInfo.startDate
                ? `${formatDate(basicInfo.startDate)} - ${formatDate(calculateEndDate(basicInfo.startDate, schedule.numberOfWeeks))} (${schedule.numberOfWeeks} weeks)`
                : 'Not set'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Venue</span>
            <span className="text-white">{basicInfo.venue || 'Not set'}</span>
          </div>
        </div>
      </div>

      {/* Capacity Summary */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Capacity & Schedule
          </h3>
          <button
            type="button"
            onClick={() => onEditStep(3)}
            disabled={isSubmitting}
            className="text-amber-400 hover:text-amber-300 text-sm font-medium disabled:opacity-50"
          >
            Edit
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Max Teams</span>
            <span className="text-white font-medium">{schedule.maxTeams}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Season Length</span>
            <span className="text-white">{schedule.numberOfWeeks} weeks</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Format</span>
            <span className="text-white capitalize">{schedule.scheduleType.replace('_', ' ')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Default Match Day</span>
            <span className="text-white">{DAYS[schedule.defaultMatchDay]}s at {formatTime(schedule.defaultMatchTime)}</span>
          </div>
        </div>
      </div>

      {/* Boards Summary */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Boards ({boards.boards.length})
          </h3>
          <button
            type="button"
            onClick={() => onEditStep(1)}
            disabled={isSubmitting}
            className="text-amber-400 hover:text-amber-300 text-sm font-medium disabled:opacity-50"
          >
            Edit
          </button>
        </div>

        <div className="space-y-2 text-sm">
          {boards.boards.map((board, index) => (
            <div key={board.id} className="flex justify-between items-center">
              <span className="text-gray-400">
                {index + 1}. {board.name}
              </span>
              <span className="text-white capitalize">
                {board.format}
              </span>
            </div>
          ))}
          <div className="pt-2 border-t border-gray-700 flex justify-between">
            <span className="text-gray-400">Points per board win</span>
            <span className="text-white font-medium">{boards.pointsPerBoardWin}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Bonus for fixture win</span>
            <span className="text-white font-medium">{boards.pointsPerMatchWin} pts</span>
          </div>
        </div>
      </div>

      {/* Roster Summary */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Roster Rules
          </h3>
          <button
            type="button"
            onClick={() => onEditStep(2)}
            disabled={isSubmitting}
            className="text-amber-400 hover:text-amber-300 text-sm font-medium disabled:opacity-50"
          >
            Edit
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Team Size</span>
            <span className="text-white">{roster.minPlayersPerTeam} - {roster.maxPlayersPerTeam} players</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Lineup Lock</span>
            <span className="text-white">{roster.lineupLockMinutesBeforeMatch} minutes before match</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Multi-Team Players</span>
            <span className="text-white">{roster.allowMultiTeamPlayers ? 'Allowed' : 'Not allowed'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">DUPR Requirement</span>
            <span className="text-white">{roster.duprMode === 'required' ? 'Required' : 'Not required'}</span>
          </div>
          {roster.duprRatingEnabled && (
            <div className="flex justify-between">
              <span className="text-gray-400">Rating Cap</span>
              <span className="text-white">{roster.duprMaxRating}</span>
            </div>
          )}
        </div>
      </div>

      {/* Fees Summary */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Fees
          </h3>
          <button
            type="button"
            onClick={() => onEditStep(2)}
            disabled={isSubmitting}
            className="text-amber-400 hover:text-amber-300 text-sm font-medium disabled:opacity-50"
          >
            Edit
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Entry Fee</span>
            <span className="text-white">
              {roster.entryFeeType === 'none'
                ? 'Free (no entry fee)'
                : `${formatAmount(roster.entryFeeAmount)} ${roster.entryFeeType === 'per_team' ? 'per team' : 'per player'}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Venue Fee</span>
            <span className="text-white">
              {roster.venueFeeEnabled
                ? `${formatAmount(roster.venueFeeAmount)} per fixture (home team)`
                : 'Not enabled'}
            </span>
          </div>
          {(roster.entryFeeType !== 'none' || roster.venueFeeEnabled) && (
            <div className="flex justify-between">
              <span className="text-gray-400">Payment Required</span>
              <span className="text-white">
                {roster.requirePaymentBeforeApproval ? 'Before approval' : 'After approval'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tiebreaker Order */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
            Tiebreakers
          </h3>
          <button
            type="button"
            onClick={() => onEditStep(3)}
            disabled={isSubmitting}
            className="text-amber-400 hover:text-amber-300 text-sm font-medium disabled:opacity-50"
          >
            Edit
          </button>
        </div>

        <div className="space-y-1 text-sm">
          {schedule.tieBreakerOrder.map((tb, index) => {
            const labels: Record<string, string> = {
              matchWins: 'Match Wins',
              boardDiff: 'Board Differential',
              headToHead: 'Head-to-Head',
              pointDiff: 'Point Differential',
            };
            return (
              <div key={tb} className="flex items-center gap-2 text-gray-300">
                <span className="w-5 h-5 rounded-full bg-gray-700 text-gray-400 flex items-center justify-center text-xs">
                  {index + 1}
                </span>
                {labels[tb]}
              </div>
            );
          })}
        </div>
      </div>

      {/* Submit notice */}
      <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-amber-200">
            <p className="font-medium mb-1">Ready to create?</p>
            <p className="text-amber-300/80">
              Your league will be created in draft status. You can publish it when ready for team registration.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StepReview;
