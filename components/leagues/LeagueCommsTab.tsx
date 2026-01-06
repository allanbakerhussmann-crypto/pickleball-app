/**
 * LeagueCommsTab - League Communications Tab
 *
 * Main container for league messaging with sub-sections:
 * - Compose: Send new messages to league players
 * - Templates: Manage reusable message templates
 * - History: View sent/pending/failed messages
 *
 * @file components/leagues/LeagueCommsTab.tsx
 * @version 07.17
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  League,
  LeagueDivision,
  LeagueMember,
  UserProfile,
  CommsQueueMessage,
  CommsMessageType,
  CommsTemplate
} from '../../types';
import {
  subscribeToLeagueMessages,
  queueBulkLeagueMessages,
  queueLeagueMessage,
  deleteLeagueQueuedMessage,
  getActiveTemplates,
  renderTemplate
} from '../../services/firebase/comms';
import { getUsersByIds } from '../../services/firebase/users';
import { CommsTemplateSection } from '../tournament/comms/CommsTemplateSection';

// ============================================
// TYPES
// ============================================

interface LeagueCommsTabProps {
  league: League;
  divisions: LeagueDivision[];
  members: LeagueMember[];
  currentUserId: string;
}

type CommsSection = 'compose' | 'templates' | 'history';

interface Recipient {
  recipientId: string;
  recipientName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
}

// ============================================
// HELPERS
// ============================================

/**
 * Normalize phone numbers to E.164 format
 * Handles legacy numbers stored without country code
 */
const normalizePhone = (phone: string | null | undefined): string | null => {
  if (!phone) return null;
  // Already in E.164 format
  if (phone.startsWith('+')) return phone;
  // NZ numbers starting with 02, 03, 04, 06, 07, 09
  if (/^0[2-47-9]/.test(phone)) {
    return '+64' + phone.slice(1); // Remove leading 0, add +64
  }
  // AU numbers starting with 04 (10 digits)
  if (phone.startsWith('04') && phone.length === 10) {
    return '+61' + phone.slice(1);
  }
  return phone;
};

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
// STATUS BADGE (for history)
// ============================================

const StatusBadge: React.FC<{ status: 'pending' | 'sent' | 'failed' }> = ({ status }) => {
  const config = {
    pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Pending' },
    sent: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Sent' },
    failed: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Failed' },
  };

  const { bg, text, label } = config[status];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
      {status === 'pending' && (
        <svg className="w-3 h-3 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {status === 'sent' && (
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
      {status === 'failed' && (
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {label}
    </span>
  );
};

// ============================================
// TYPE BADGE (for history)
// ============================================

const TypeBadge: React.FC<{ type: CommsMessageType }> = ({ type }) => {
  const config = {
    sms: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'SMS' },
    email: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Email' },
  };

  const { bg, text, label } = config[type];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${bg} ${text}`}>
      {type === 'sms' ? (
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ) : (
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )}
      {label}
    </span>
  );
};

// ============================================
// CONSTANTS
// ============================================

const SMS_CHAR_LIMIT = 160;
const SMS_CHAR_WARNING = 140;
const SMS_MAX_SEGMENTS = 2;

// ============================================
// TYPE TOGGLE
// ============================================

const TypeToggle: React.FC<{
  type: CommsMessageType;
  onChange: (type: CommsMessageType) => void;
}> = ({ type, onChange }) => (
  <div className="flex rounded-lg bg-gray-800/50 p-1 border border-gray-700/50">
    <button
      onClick={() => onChange('sms')}
      className={`flex items-center gap-2 flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
        type === 'sms'
          ? 'bg-blue-500/20 text-blue-400'
          : 'text-gray-400 hover:text-gray-300'
      }`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      SMS
    </button>
    <button
      onClick={() => onChange('email')}
      className={`flex items-center gap-2 flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
        type === 'email'
          ? 'bg-purple-500/20 text-purple-400'
          : 'text-gray-400 hover:text-gray-300'
      }`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
      Email
    </button>
  </div>
);

// ============================================
// CHARACTER COUNTER
// ============================================

const CharCounter: React.FC<{ current: number; limit: number; warning: number }> = ({
  current,
  limit,
  warning,
}) => {
  const segments = Math.ceil(current / limit);
  const isWarning = current > warning && current <= limit;
  const isOver = current > limit;
  const isMultiSegment = segments > 1;

  return (
    <div className={`text-xs flex items-center gap-2 ${
      isOver ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-gray-500'
    }`}>
      <span>{current}/{limit}</span>
      {isMultiSegment && (
        <span className={segments > SMS_MAX_SEGMENTS ? 'text-red-400' : 'text-yellow-400'}>
          ({segments} SMS segments)
        </span>
      )}
    </div>
  );
};

// ============================================
// LEAGUE COMPOSE SECTION
// ============================================

interface LeagueComposeSectionProps {
  league: League;
  divisions: LeagueDivision[];
  players: UserProfile[];
  currentUserId: string;
  onMessageSent: () => void;
}

const LeagueComposeSection: React.FC<LeagueComposeSectionProps> = ({
  league,
  divisions,
  players,
  currentUserId,
  onMessageSent,
}) => {
  const [messageType, setMessageType] = useState<CommsMessageType>('sms');
  const [selectedRecipients, setSelectedRecipients] = useState<Recipient[]>([]);
  const [recipientMode, setRecipientMode] = useState<'group' | 'individual'>('group');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templates, setTemplates] = useState<(CommsTemplate & { id: string })[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Load templates
  useEffect(() => {
    const loadTemplates = async () => {
      const tpls = await getActiveTemplates();
      setTemplates(tpls.filter(t => t.type === messageType));
    };
    loadTemplates();
  }, [messageType]);

  // Filter players by division for group selection
  const filteredPlayers = useMemo(() => {
    let result = players;

    if (recipientMode === 'group' && selectedDivision !== 'all' && league.hasDivisions) {
      // Filter by division - need to cross-reference with members
      result = players.filter(_p => {
        // This is a simplified check - in real implementation, you'd need to check member's divisionId
        return true; // For now, include all players when a specific division is selected
      });
    }

    if (recipientMode === 'individual' && searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p =>
        (p.displayName?.toLowerCase() || '').includes(term) ||
        (p.email?.toLowerCase() || '').includes(term) ||
        (p.phone || '').includes(term)
      );
    }

    // Filter by required contact info
    result = result.filter(p => {
      if (messageType === 'sms') return !!p.phone;
      if (messageType === 'email') return !!p.email;
      return true;
    });

    return result;
  }, [players, recipientMode, selectedDivision, searchTerm, messageType, league.hasDivisions]);

  // Build recipients from filtered players
  const buildRecipientsFromPlayers = (playerList: UserProfile[]): Recipient[] => {
    return playerList.map(p => ({
      recipientId: p.odUserId || p.id || '',
      recipientName: p.displayName || 'Unknown',
      recipientEmail: p.email || null,
      recipientPhone: normalizePhone(p.phone),
    }));
  };

  // Get eligible count for group selection
  const eligibleCount = filteredPlayers.length;

  // Handle template selection
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId) {
      const template = templates.find(t => t.id === templateId);
      if (template) {
        const data = {
          leagueName: league.name,
          playerName: '{{playerName}}',
        };
        setBody(renderTemplate(template.body, data));
        if (template.subject) {
          setSubject(renderTemplate(template.subject, data));
        }
      }
    }
  };

  // Handle send
  const handleSend = async () => {
    setIsSending(true);
    try {
      let recipients: Recipient[];

      if (recipientMode === 'group') {
        recipients = buildRecipientsFromPlayers(filteredPlayers);
      } else {
        recipients = selectedRecipients;
      }

      await queueBulkLeagueMessages(league.id, recipients, {
        type: messageType,
        templateId: selectedTemplateId || null,
        subject: messageType === 'email' ? subject : null,
        body,
        createdBy: currentUserId,
      });

      // Reset form
      setBody('');
      setSubject('');
      setSelectedRecipients([]);
      setSelectedTemplateId('');
      setShowConfirmModal(false);
      onMessageSent();
    } catch (error) {
      console.error('Failed to send messages:', error);
    } finally {
      setIsSending(false);
    }
  };

  const canSend = body.trim() && (recipientMode === 'group' ? eligibleCount > 0 : selectedRecipients.length > 0);
  const segments = Math.ceil(body.length / SMS_CHAR_LIMIT);

  return (
    <div className="space-y-6">
      {/* Message Type Toggle */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">MESSAGE TYPE</label>
        <TypeToggle type={messageType} onChange={setMessageType} />
      </div>

      {/* Recipients Section */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">RECIPIENTS</label>

        {/* Mode Toggle */}
        <div className="flex rounded-lg bg-gray-800/50 p-1 border border-gray-700/50 mb-3">
          <button
            onClick={() => setRecipientMode('group')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              recipientMode === 'group'
                ? 'bg-lime-500/20 text-lime-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            By Group
          </button>
          <button
            onClick={() => setRecipientMode('individual')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              recipientMode === 'individual'
                ? 'bg-lime-500/20 text-lime-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Individual
          </button>
        </div>

        {recipientMode === 'group' ? (
          <div className="space-y-3">
            {/* Division Selector */}
            {league.hasDivisions && divisions.length > 0 && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Division</label>
                <select
                  value={selectedDivision}
                  onChange={(e) => setSelectedDivision(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-lime-500 focus:border-transparent"
                >
                  <option value="all">All Divisions</option>
                  {divisions.map(div => (
                    <option key={div.id} value={div.id}>{div.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="text-sm text-gray-400">
              {eligibleCount} recipient{eligibleCount !== 1 ? 's' : ''} with {messageType === 'sms' ? 'phone' : 'email'}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Search */}
            <input
              type="text"
              placeholder="Search players..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-lime-500 focus:border-transparent"
            />

            {/* Player List */}
            <div className="max-h-48 overflow-y-auto space-y-1 bg-gray-800/50 rounded-lg p-2 border border-gray-700/50">
              {filteredPlayers.map(player => {
                const isSelected = selectedRecipients.some(r => r.recipientId === (player.odUserId || player.id));
                return (
                  <label
                    key={player.odUserId || player.id}
                    className="flex items-center gap-2 p-2 rounded hover:bg-gray-700/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRecipients([...selectedRecipients, {
                            recipientId: player.odUserId || player.id || '',
                            recipientName: player.displayName || 'Unknown',
                            recipientEmail: player.email || null,
                            recipientPhone: normalizePhone(player.phone),
                          }]);
                        } else {
                          setSelectedRecipients(selectedRecipients.filter(r => r.recipientId !== (player.odUserId || player.id)));
                        }
                      }}
                      className="rounded border-gray-600 text-lime-500 focus:ring-lime-500"
                    />
                    <span className="text-sm text-white">{player.displayName}</span>
                    <span className="text-xs text-gray-500">
                      {messageType === 'sms' ? player.phone : player.email}
                    </span>
                  </label>
                );
              })}
              {filteredPlayers.length === 0 && (
                <div className="text-center text-gray-500 text-sm py-4">
                  No players with {messageType === 'sms' ? 'phone numbers' : 'email addresses'}
                </div>
              )}
            </div>

            <div className="text-sm text-gray-400">
              {selectedRecipients.length} selected
            </div>
          </div>
        )}
      </div>

      {/* Template Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">TEMPLATE (OPTIONAL)</label>
        <select
          value={selectedTemplateId}
          onChange={(e) => handleTemplateSelect(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-lime-500 focus:border-transparent"
        >
          <option value="">No template - write custom message</option>
          {templates.map(tpl => (
            <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
          ))}
        </select>
      </div>

      {/* Subject (email only) */}
      {messageType === 'email' && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">SUBJECT</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Enter email subject..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-lime-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Message Body */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium text-gray-300">MESSAGE</label>
          {messageType === 'sms' && (
            <CharCounter current={body.length} limit={SMS_CHAR_LIMIT} warning={SMS_CHAR_WARNING} />
          )}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Enter SMS message..."
          rows={4}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-lime-500 focus:border-transparent resize-none"
        />
      </div>

      {/* Send Button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowConfirmModal(true)}
          disabled={!canSend || (messageType === 'sms' && segments > SMS_MAX_SEGMENTS)}
          className="flex items-center gap-2 px-6 py-2.5 bg-lime-600 hover:bg-lime-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          Send {messageType.toUpperCase()}
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 max-w-md w-full mx-4 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Confirm Send</h3>
            <p className="text-gray-300 mb-6">
              Send {recipientMode === 'group' ? eligibleCount : selectedRecipients.length} {messageType.toUpperCase()} message{(recipientMode === 'group' ? eligibleCount : selectedRecipients.length) !== 1 ? 's' : ''}?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={isSending}
                className="px-4 py-2 bg-lime-600 hover:bg-lime-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {isSending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// LEAGUE HISTORY SECTION
// ============================================

interface LeagueHistorySectionProps {
  leagueId: string;
  messages: (CommsQueueMessage & { id: string })[];
  isLoading: boolean;
}

const LeagueHistorySection: React.FC<LeagueHistorySectionProps> = ({
  leagueId,
  messages,
  isLoading,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'sent' | 'failed'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'sms' | 'email'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (messageId: string) => {
    if (!confirm('Delete this message?')) return;
    setDeleting(messageId);
    try {
      await deleteLeagueQueuedMessage(leagueId, messageId);
    } catch (error) {
      console.error('Failed to delete message:', error);
    } finally {
      setDeleting(null);
    }
  };

  const filteredMessages = useMemo(() => {
    let result = messages;
    if (statusFilter !== 'all') {
      result = result.filter(m => m.status === statusFilter);
    }
    if (typeFilter !== 'all') {
      result = result.filter(m => m.type === typeFilter);
    }
    return result;
  }, [messages, statusFilter, typeFilter]);

  const handleRetry = async (message: CommsQueueMessage & { id: string }) => {
    setRetrying(message.id);
    try {
      await queueLeagueMessage(leagueId, {
        type: message.type,
        recipientId: message.recipientId,
        recipientName: message.recipientName,
        recipientEmail: message.recipientEmail,
        recipientPhone: message.recipientPhone,
        body: message.body,
        subject: message.subject,
        templateId: message.templateId,
        templateData: message.templateData,
        leagueId,
        divisionId: message.divisionId,
        matchId: message.matchId,
        createdBy: message.createdBy,
        retried: true,
        retryOf: message.id,
      });
    } catch (error) {
      console.error('Failed to retry message:', error);
    } finally {
      setRetrying(null);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-lime-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-lime-500 focus:border-transparent"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-lime-500 focus:border-transparent"
        >
          <option value="all">All Types</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
        </select>
      </div>

      {/* Messages List */}
      {filteredMessages.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No messages found
        </div>
      ) : (
        <div className="space-y-2">
          {filteredMessages.map(message => (
            <div
              key={message.id}
              className="bg-gray-800/50 border border-gray-700/50 rounded-lg overflow-hidden"
            >
              {/* Header Row */}
              <button
                onClick={() => setExpandedId(expandedId === message.id ? null : message.id)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-700/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <StatusBadge status={message.status} />
                  <TypeBadge type={message.type} />
                  <span className="text-white font-medium">{message.recipientName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{formatDate(message.createdAt)}</span>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${expandedId === message.id ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded Details */}
              {expandedId === message.id && (
                <div className="px-4 pb-4 border-t border-gray-700/50 pt-3 space-y-3">
                  <div>
                    <span className="text-xs text-gray-500">Contact:</span>
                    <span className="text-sm text-gray-300 ml-2">
                      {message.type === 'sms' ? message.recipientPhone : message.recipientEmail}
                    </span>
                  </div>

                  {message.subject && (
                    <div>
                      <span className="text-xs text-gray-500">Subject:</span>
                      <span className="text-sm text-gray-300 ml-2">{message.subject}</span>
                    </div>
                  )}

                  <div>
                    <span className="text-xs text-gray-500 block mb-1">Message:</span>
                    <p className="text-sm text-gray-300 bg-gray-900/50 p-2 rounded">{message.body}</p>
                  </div>

                  {message.status === 'sent' && message.sentAt && (
                    <div>
                      <span className="text-xs text-gray-500">Sent at:</span>
                      <span className="text-sm text-green-400 ml-2">{formatDate(message.sentAt)}</span>
                    </div>
                  )}

                  {message.status === 'failed' && (
                    <>
                      {message.error && (
                        <div>
                          <span className="text-xs text-gray-500">Error:</span>
                          <span className="text-sm text-red-400 ml-2">{message.error}</span>
                        </div>
                      )}
                      <button
                        onClick={() => handleRetry(message)}
                        disabled={retrying === message.id}
                        className="flex items-center gap-2 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
                      >
                        {retrying === message.id ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Retrying...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Retry
                          </>
                        )}
                      </button>
                    </>
                  )}

                  {(message.status === 'pending' || message.status === 'failed') && (
                    <button
                      onClick={() => handleDelete(message.id)}
                      disabled={deleting === message.id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
                    >
                      {deleting === message.id ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Deleting...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const LeagueCommsTab: React.FC<LeagueCommsTabProps> = ({
  league,
  divisions,
  members,
  currentUserId,
}) => {
  const [activeSection, setActiveSection] = useState<CommsSection>('compose');
  const [messages, setMessages] = useState<(CommsQueueMessage & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [playersCache, setPlayersCache] = useState<Record<string, UserProfile>>({});
  const [loadingProfiles, setLoadingProfiles] = useState(true);

  // Subscribe to messages
  useEffect(() => {
    if (!league.id) return;

    setIsLoading(true);
    const unsubscribe = subscribeToLeagueMessages(league.id, (msgs) => {
      setMessages(msgs);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [league.id]);

  // Load user profiles for members
  useEffect(() => {
    const loadProfiles = async () => {
      if (!members.length) {
        setLoadingProfiles(false);
        return;
      }

      // Collect all user IDs (including partners for doubles)
      const userIds = new Set<string>();
      members.filter(m => m.status === 'active').forEach(m => {
        userIds.add(m.userId);
        if (m.partnerUserId) userIds.add(m.partnerUserId);
      });

      try {
        const profiles = await getUsersByIds([...userIds]);
        const cache: Record<string, UserProfile> = {};
        profiles.forEach(p => {
          cache[p.odUserId || p.id || ''] = p;
        });
        setPlayersCache(cache);
      } catch (error) {
        console.error('Failed to load user profiles:', error);
      } finally {
        setLoadingProfiles(false);
      }
    };

    loadProfiles();
  }, [members]);

  // Calculate stats
  const stats = useMemo(() => ({
    total: messages.length,
    pending: messages.filter(m => m.status === 'pending').length,
    sent: messages.filter(m => m.status === 'sent').length,
    failed: messages.filter(m => m.status === 'failed').length,
  }), [messages]);

  // Get unique players from playersCache
  const allPlayers = useMemo(() => {
    return Object.values(playersCache);
  }, [playersCache]);

  if (loadingProfiles) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-lime-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-lime-500/20 to-green-500/10 border border-lime-500/30 flex items-center justify-center">
          <MessageIcon />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Communications</h2>
          <p className="text-sm text-gray-400">Send SMS and email to league players</p>
        </div>
      </div>

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
          <LeagueComposeSection
            league={league}
            divisions={divisions}
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
          <LeagueHistorySection
            leagueId={league.id}
            messages={messages}
            isLoading={isLoading}
          />
        )}
      </div>
    </div>
  );
};

export default LeagueCommsTab;
