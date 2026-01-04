/**
 * RecipientPicker - Recipient Selection Component
 *
 * Allows selection of message recipients by:
 * - Group (division/pool) - bulk selection
 * - Individual - checkbox list with search
 *
 * @file components/tournament/comms/RecipientPicker.tsx
 * @version 07.08
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Division, Team, UserProfile, CommsMessageType } from '../../../types';

// ============================================
// TYPES
// ============================================

export interface Recipient {
  recipientId: string;
  recipientName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
}

interface RecipientPickerProps {
  divisions: Division[];
  teams: Team[];
  players: UserProfile[];
  messageType: CommsMessageType;
  selectedRecipients: Recipient[];
  onRecipientsChange: (recipients: Recipient[]) => void;
}

type SelectionMode = 'group' | 'individual';

// ============================================
// HELPER FUNCTIONS
// ============================================

const getPlayerFromProfile = (profile: UserProfile): Recipient => ({
  recipientId: profile.odUserId || profile.odAccountId || '',
  recipientName: profile.displayName || 'Unknown',
  recipientEmail: profile.email || null,
  recipientPhone: profile.phone || null,
});

const hasRequiredContact = (recipient: Recipient, type: CommsMessageType): boolean => {
  if (type === 'sms') return !!recipient.recipientPhone;
  if (type === 'email') return !!recipient.recipientEmail;
  return false;
};

// ============================================
// MODE TOGGLE
// ============================================

const ModeToggle: React.FC<{
  mode: SelectionMode;
  onChange: (mode: SelectionMode) => void;
}> = ({ mode, onChange }) => (
  <div className="flex rounded-lg bg-gray-800/50 p-1 border border-gray-700/50">
    <button
      onClick={() => onChange('group')}
      className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        mode === 'group'
          ? 'bg-lime-500/20 text-lime-400'
          : 'text-gray-400 hover:text-gray-300'
      }`}
    >
      By Group
    </button>
    <button
      onClick={() => onChange('individual')}
      className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        mode === 'individual'
          ? 'bg-lime-500/20 text-lime-400'
          : 'text-gray-400 hover:text-gray-300'
      }`}
    >
      Individual
    </button>
  </div>
);

// ============================================
// GROUP SELECTOR
// ============================================

interface GroupSelectorProps {
  divisions: Division[];
  teams: Team[];
  players: UserProfile[];
  messageType: CommsMessageType;
  onSelect: (recipients: Recipient[]) => void;
}

const GroupSelector: React.FC<GroupSelectorProps> = ({
  divisions,
  teams,
  players,
  messageType,
  onSelect,
}) => {
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [selectedPool, setSelectedPool] = useState<string>('');

  // Get pools for selected division
  const pools = useMemo(() => {
    if (!selectedDivision) return [];
    const divisionTeams = teams.filter(t => t.divisionId === selectedDivision);
    const poolSet = new Set<string>();
    divisionTeams.forEach(t => {
      if (t.poolGroup) poolSet.add(t.poolGroup);
    });
    return Array.from(poolSet).sort();
  }, [selectedDivision, teams]);

  // Get recipients based on selection
  const getRecipients = useCallback((): Recipient[] => {
    let filteredTeams = teams;

    if (selectedDivision) {
      filteredTeams = filteredTeams.filter(t => t.divisionId === selectedDivision);
    }

    if (selectedPool) {
      filteredTeams = filteredTeams.filter(t => t.poolGroup === selectedPool);
    }

    // Get unique player IDs
    const playerIds = new Set<string>();
    filteredTeams.forEach(team => {
      team.playerIds?.forEach(id => playerIds.add(id));
    });

    // Map to recipients
    const recipients: Recipient[] = [];
    const seen = new Set<string>();

    playerIds.forEach(id => {
      if (seen.has(id)) return;
      seen.add(id);

      const profile = players.find(p =>
        p.odUserId === id || p.odAccountId === id
      );

      if (profile) {
        const recipient = getPlayerFromProfile(profile);
        if (hasRequiredContact(recipient, messageType)) {
          recipients.push(recipient);
        }
      }
    });

    return recipients;
  }, [selectedDivision, selectedPool, teams, players, messageType]);

  const recipientCount = getRecipients().length;

  const handleApply = () => {
    onSelect(getRecipients());
  };

  return (
    <div className="space-y-4">
      {/* Division Select */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Division</label>
        <select
          value={selectedDivision}
          onChange={(e) => {
            setSelectedDivision(e.target.value);
            setSelectedPool('');
          }}
          className="w-full bg-gray-800/70 text-white px-3 py-2 rounded-lg border border-gray-700/50 focus:border-lime-500/50 outline-none text-sm"
        >
          <option value="">All Divisions</option>
          {divisions.map(div => (
            <option key={div.id} value={div.id}>{div.name}</option>
          ))}
        </select>
      </div>

      {/* Pool Select (if pools exist) */}
      {pools.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Pool</label>
          <select
            value={selectedPool}
            onChange={(e) => setSelectedPool(e.target.value)}
            className="w-full bg-gray-800/70 text-white px-3 py-2 rounded-lg border border-gray-700/50 focus:border-lime-500/50 outline-none text-sm"
          >
            <option value="">All Pools</option>
            {pools.map(pool => (
              <option key={pool} value={pool}>{pool}</option>
            ))}
          </select>
        </div>
      )}

      {/* Preview & Apply */}
      <div className="flex items-center justify-between pt-2">
        <span className="text-sm text-gray-400">
          {recipientCount} recipient{recipientCount !== 1 ? 's' : ''} with {messageType === 'sms' ? 'phone' : 'email'}
        </span>
        <button
          onClick={handleApply}
          disabled={recipientCount === 0}
          className="px-4 py-2 bg-lime-500/20 text-lime-400 rounded-lg text-sm font-medium hover:bg-lime-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Select Group
        </button>
      </div>
    </div>
  );
};

// ============================================
// INDIVIDUAL SELECTOR
// ============================================

interface IndividualSelectorProps {
  players: UserProfile[];
  messageType: CommsMessageType;
  selectedIds: Set<string>;
  onToggle: (id: string, recipient: Recipient) => void;
  onSelectAll: (recipients: Recipient[]) => void;
  onClearAll: () => void;
}

const IndividualSelector: React.FC<IndividualSelectorProps> = ({
  players,
  messageType,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
}) => {
  const [search, setSearch] = useState('');

  // Filter players with required contact
  const eligiblePlayers = useMemo(() => {
    return players
      .map(getPlayerFromProfile)
      .filter(r => hasRequiredContact(r, messageType));
  }, [players, messageType]);

  // Filter by search
  const filteredPlayers = useMemo(() => {
    if (!search.trim()) return eligiblePlayers;
    const searchLower = search.toLowerCase();
    return eligiblePlayers.filter(r =>
      r.recipientName.toLowerCase().includes(searchLower) ||
      r.recipientEmail?.toLowerCase().includes(searchLower) ||
      r.recipientPhone?.includes(search)
    );
  }, [eligiblePlayers, search]);

  const handleSelectAll = () => {
    onSelectAll(filteredPlayers);
  };

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players..."
          className="w-full bg-gray-800/70 text-white pl-10 pr-4 py-2 rounded-lg border border-gray-700/50 focus:border-lime-500/50 outline-none text-sm placeholder-gray-500"
        />
      </div>

      {/* Bulk Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSelectAll}
          className="text-xs text-lime-400 hover:underline"
        >
          Select All ({filteredPlayers.length})
        </button>
        <span className="text-gray-600">|</span>
        <button
          onClick={onClearAll}
          className="text-xs text-gray-400 hover:text-gray-300"
        >
          Clear
        </button>
        <span className="ml-auto text-xs text-gray-500">
          {selectedIds.size} selected
        </span>
      </div>

      {/* Player List */}
      <div className="max-h-60 overflow-y-auto space-y-1 rounded-lg border border-gray-700/50 bg-gray-800/30 p-2">
        {filteredPlayers.length === 0 ? (
          <div className="text-center py-4 text-gray-500 text-sm">
            No players with {messageType === 'sms' ? 'phone numbers' : 'email addresses'}
          </div>
        ) : (
          filteredPlayers.map(recipient => (
            <label
              key={recipient.recipientId}
              className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-gray-700/30 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(recipient.recipientId)}
                onChange={() => onToggle(recipient.recipientId, recipient)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-lime-500 focus:ring-lime-500/30"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{recipient.recipientName}</div>
                <div className="text-xs text-gray-500 truncate">
                  {messageType === 'sms' ? recipient.recipientPhone : recipient.recipientEmail}
                </div>
              </div>
            </label>
          ))
        )}
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const RecipientPicker: React.FC<RecipientPickerProps> = ({
  divisions,
  teams,
  players,
  messageType,
  selectedRecipients,
  onRecipientsChange,
}) => {
  const [mode, setMode] = useState<SelectionMode>('group');

  // Track selected IDs for individual mode
  const selectedIds = useMemo(() => {
    return new Set(selectedRecipients.map(r => r.recipientId));
  }, [selectedRecipients]);

  // Handle group selection
  const handleGroupSelect = (recipients: Recipient[]) => {
    onRecipientsChange(recipients);
  };

  // Handle individual toggle
  const handleToggle = (id: string, recipient: Recipient) => {
    if (selectedIds.has(id)) {
      onRecipientsChange(selectedRecipients.filter(r => r.recipientId !== id));
    } else {
      onRecipientsChange([...selectedRecipients, recipient]);
    }
  };

  // Handle select all
  const handleSelectAll = (recipients: Recipient[]) => {
    const merged = [...selectedRecipients];
    recipients.forEach(r => {
      if (!selectedIds.has(r.recipientId)) {
        merged.push(r);
      }
    });
    onRecipientsChange(merged);
  };

  // Handle clear all
  const handleClearAll = () => {
    onRecipientsChange([]);
  };

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <ModeToggle mode={mode} onChange={setMode} />

      {/* Selection UI */}
      {mode === 'group' ? (
        <GroupSelector
          divisions={divisions}
          teams={teams}
          players={players}
          messageType={messageType}
          onSelect={handleGroupSelect}
        />
      ) : (
        <IndividualSelector
          players={players}
          messageType={messageType}
          selectedIds={selectedIds}
          onToggle={handleToggle}
          onSelectAll={handleSelectAll}
          onClearAll={handleClearAll}
        />
      )}

      {/* Selected Count */}
      {selectedRecipients.length > 0 && (
        <div className="flex items-center justify-between pt-2 border-t border-gray-700/50">
          <span className="text-sm font-medium text-lime-400">
            {selectedRecipients.length} recipient{selectedRecipients.length !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={handleClearAll}
            className="text-xs text-gray-400 hover:text-red-400 transition-colors"
          >
            Clear All
          </button>
        </div>
      )}
    </div>
  );
};

export default RecipientPicker;
