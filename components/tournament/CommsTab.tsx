/**
 * CommsTab - Tournament Communications Tab
 *
 * Main container for tournament messaging with sub-sections:
 * - Compose: Send new messages to players
 * - Templates: Manage reusable message templates
 * - History: View sent/pending/failed messages
 *
 * V07.19: Added SMS credits display and purchase flow
 *
 * @file components/tournament/CommsTab.tsx
 * @version 07.19
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Tournament, Division, Team, UserProfile, CommsQueueMessage } from '../../types';
import { subscribeToTournamentMessages } from '../../services/firebase/comms';
import { CommsComposeSection } from './comms/CommsComposeSection';
import { CommsHistorySection } from './comms/CommsHistorySection';
import { CommsTemplateSection } from './comms/CommsTemplateSection';
import { SMSCreditsCard, SMSBundleSelector } from '../sms';

// ============================================
// TYPES
// ============================================

interface CommsTabProps {
  tournament: Tournament;
  divisions: Division[];
  teams: Team[];
  playersCache: Record<string, UserProfile>;
  currentUserId: string;
}

type CommsSection = 'compose' | 'templates' | 'history';

// ============================================
// ICONS
// ============================================

const ComposeIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const TemplateIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
  </svg>
);

const HistoryIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const MessageIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

// ============================================
// STAT CARD COMPONENT
// ============================================

interface StatCardProps {
  label: string;
  value: number;
  color: 'yellow' | 'green' | 'red' | 'blue';
  icon: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, color, icon }) => {
  const colorClasses = {
    yellow: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    green: 'bg-green-500/10 border-green-500/30 text-green-400',
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  };

  const iconBgClasses = {
    yellow: 'bg-yellow-500/20',
    green: 'bg-green-500/20',
    red: 'bg-red-500/20',
    blue: 'bg-blue-500/20',
  };

  return (
    <div className={`rounded-xl border px-4 py-3 ${colorClasses[color]}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBgClasses[color]}`}>
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs opacity-70">{label}</div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// SECTION TAB BUTTON
// ============================================

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, icon, children }) => (
  <button
    onClick={onClick}
    className={`
      flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm
      transition-all duration-200
      ${active
        ? 'bg-lime-500/20 text-lime-400 border border-lime-500/30'
        : 'bg-gray-800/50 text-gray-400 border border-gray-700/50 hover:bg-gray-700/50 hover:text-gray-300'
      }
    `}
  >
    {icon}
    {children}
  </button>
);

// ============================================
// MAIN COMPONENT
// ============================================

export const CommsTab: React.FC<CommsTabProps> = ({
  tournament,
  divisions,
  teams,
  playersCache,
  currentUserId,
}) => {
  const [activeSection, setActiveSection] = useState<CommsSection>('compose');
  const [messages, setMessages] = useState<(CommsQueueMessage & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBundleSelector, setShowBundleSelector] = useState(false);

  // Subscribe to messages
  useEffect(() => {
    if (!tournament.id) return;

    setIsLoading(true);
    const unsubscribe = subscribeToTournamentMessages(tournament.id, (msgs) => {
      setMessages(msgs);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [tournament.id]);

  // Calculate stats
  const stats = useMemo(() => ({
    total: messages.length,
    pending: messages.filter(m => m.status === 'pending').length,
    sent: messages.filter(m => m.status === 'sent').length,
    failed: messages.filter(m => m.status === 'failed').length,
  }), [messages]);

  // Get unique players from teams
  // Teams store player IDs in team.players (not team.playerIds)
  const allPlayers = useMemo(() => {
    const playerIds = new Set<string>();
    teams.forEach(team => {
      (team.players || []).forEach(p => {
        const pid = typeof p === 'string' ? p : (p.odUserId || p.id || '');
        if (pid) playerIds.add(pid);
      });
    });
    return Array.from(playerIds)
      .map(id => playersCache[id])
      .filter(Boolean);
  }, [teams, playersCache]);

  return (
    <div className="space-y-6">
      {/* Header with SMS Credits */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-lime-500/20 to-green-500/10 border border-lime-500/30 flex items-center justify-center">
            <MessageIcon />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Communications</h2>
            <p className="text-sm text-gray-400">Send SMS and email to tournament players</p>
          </div>
        </div>

        {/* SMS Credits Card (compact) */}
        <SMSCreditsCard
          userId={currentUserId}
          onBuyMore={() => setShowBundleSelector(true)}
          compact
        />
      </div>

      {/* SMS Bundle Selector Modal */}
      {showBundleSelector && (
        <SMSBundleSelector
          userId={currentUserId}
          onClose={() => setShowBundleSelector(false)}
          onPurchaseComplete={() => setShowBundleSelector(false)}
        />
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Messages"
          value={stats.total}
          color="blue"
          icon={<MessageIcon />}
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          color="yellow"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Sent"
          value={stats.sent}
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          }
        />
        <StatCard
          label="Failed"
          value={stats.failed}
          color="red"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          }
        />
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 flex-wrap">
        <TabButton
          active={activeSection === 'compose'}
          onClick={() => setActiveSection('compose')}
          icon={<ComposeIcon />}
        >
          Compose
        </TabButton>
        <TabButton
          active={activeSection === 'templates'}
          onClick={() => setActiveSection('templates')}
          icon={<TemplateIcon />}
        >
          Templates
        </TabButton>
        <TabButton
          active={activeSection === 'history'}
          onClick={() => setActiveSection('history')}
          icon={<HistoryIcon />}
        >
          History
        </TabButton>
      </div>

      {/* Section Content */}
      <div className="min-h-[400px]">
        {activeSection === 'compose' && (
          <CommsComposeSection
            tournament={tournament}
            divisions={divisions}
            teams={teams}
            players={allPlayers}
            currentUserId={currentUserId}
            onMessageSent={() => {
              // Messages will auto-update via subscription
            }}
          />
        )}

        {activeSection === 'templates' && (
          <CommsTemplateSection
            currentUserId={currentUserId}
          />
        )}

        {activeSection === 'history' && (
          <CommsHistorySection
            tournamentId={tournament.id}
            messages={messages}
            isLoading={isLoading}
          />
        )}
      </div>
    </div>
  );
};

export default CommsTab;
