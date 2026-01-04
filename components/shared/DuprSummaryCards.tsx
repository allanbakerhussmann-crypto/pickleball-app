/**
 * DuprSummaryCards - Summary statistics cards for DUPR panel
 *
 * Displays 6 status cards showing match counts by category:
 * - Total, Needs Review, Ready for DUPR, Submitted, Failed, Blocked
 *
 * @version V07.10
 * @file components/shared/DuprSummaryCards.tsx
 */

import React from 'react';
import type { DuprPanelStats, DuprMatchCategory } from '../../types/duprPanel';

interface DuprSummaryCardsProps {
  stats: DuprPanelStats;
  onCardClick?: (category: DuprMatchCategory | 'all') => void;
  activeCategory?: DuprMatchCategory | 'all';
}

interface StatCardProps {
  label: string;
  count: number;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
}

function StatCard({
  label,
  count,
  color,
  bgColor,
  borderColor,
  icon,
  isActive,
  onClick,
}: StatCardProps) {
  return (
    <button
      onClick={onClick}
      className={`
        relative p-4 rounded-xl border transition-all duration-200
        ${bgColor} ${borderColor}
        ${isActive ? 'ring-2 ring-lime-500 ring-offset-2 ring-offset-gray-950' : ''}
        ${onClick ? 'hover:scale-[1.02] cursor-pointer' : 'cursor-default'}
        text-left w-full
      `}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-xs font-medium ${color} uppercase tracking-wide`}>
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold text-white">{count}</p>
        </div>
        <div className={`${color} opacity-80`}>{icon}</div>
      </div>
    </button>
  );
}

export function DuprSummaryCards({
  stats,
  onCardClick,
  activeCategory = 'all',
}: DuprSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* Total */}
      <StatCard
        label="Total"
        count={stats.total}
        color="text-blue-400"
        bgColor="bg-blue-500/10"
        borderColor="border-blue-500/30"
        isActive={activeCategory === 'all'}
        onClick={() => onCardClick?.('all')}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        }
      />

      {/* Needs Review */}
      <StatCard
        label="Needs Review"
        count={stats.needsReview}
        color="text-yellow-400"
        bgColor="bg-yellow-500/10"
        borderColor="border-yellow-500/30"
        isActive={activeCategory === 'needs_review'}
        onClick={() => onCardClick?.('needs_review')}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        }
      />

      {/* Ready for DUPR */}
      <StatCard
        label="Ready"
        count={stats.readyForDupr}
        color="text-lime-400"
        bgColor="bg-lime-500/10"
        borderColor="border-lime-500/30"
        isActive={activeCategory === 'ready_for_dupr'}
        onClick={() => onCardClick?.('ready_for_dupr')}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />

      {/* Submitted */}
      <StatCard
        label="Submitted"
        count={stats.submitted}
        color="text-gray-400"
        bgColor="bg-gray-500/10"
        borderColor="border-gray-500/30"
        isActive={activeCategory === 'submitted'}
        onClick={() => onCardClick?.('submitted')}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        }
      />

      {/* Failed */}
      <StatCard
        label="Failed"
        count={stats.failed}
        color="text-red-400"
        bgColor="bg-red-500/10"
        borderColor="border-red-500/30"
        isActive={activeCategory === 'failed'}
        onClick={() => onCardClick?.('failed')}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />

      {/* Blocked */}
      <StatCard
        label="Blocked"
        count={stats.blocked}
        color="text-orange-400"
        bgColor="bg-orange-500/10"
        borderColor="border-orange-500/30"
        isActive={activeCategory === 'blocked'}
        onClick={() => onCardClick?.('blocked')}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        }
      />
    </div>
  );
}

export default DuprSummaryCards;
