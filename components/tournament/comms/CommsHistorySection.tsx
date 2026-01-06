/**
 * CommsHistorySection - Message History Log
 *
 * Displays sent/pending/failed messages with filtering and details.
 *
 * @file components/tournament/comms/CommsHistorySection.tsx
 * @version 07.08
 */

import React, { useState, useMemo } from 'react';
import { CommsQueueMessage, CommsMessageStatus, CommsMessageType } from '../../../types';
import { queueMessage, deleteQueuedMessage } from '../../../services/firebase/comms';

// ============================================
// TYPES
// ============================================

interface CommsHistorySectionProps {
  tournamentId: string;
  messages: (CommsQueueMessage & { id: string })[];
  isLoading: boolean;
}

// ============================================
// STATUS BADGE
// ============================================

const StatusBadge: React.FC<{ status: CommsMessageStatus }> = ({ status }) => {
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
// TYPE BADGE
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
// MESSAGE ROW
// ============================================

interface MessageRowProps {
  message: CommsQueueMessage & { id: string };
  isExpanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onDelete: () => void;
  isRetrying: boolean;
  isDeleting: boolean;
}

const MessageRow: React.FC<MessageRowProps> = ({
  message,
  isExpanded,
  onToggle,
  onRetry,
  onDelete,
  isRetrying,
  isDeleting,
}) => {
  const formatTime = (timestamp: number | null | undefined) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('en-NZ', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const truncateBody = (body: string, maxLength = 50) => {
    if (body.length <= maxLength) return body;
    return body.substring(0, maxLength) + '...';
  };

  return (
    <div className="border border-gray-700/50 rounded-lg overflow-hidden bg-gray-800/30">
      {/* Main Row */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-4 hover:bg-gray-700/30 transition-colors text-left"
      >
        {/* Expand Icon */}
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>

        {/* Type */}
        <TypeBadge type={message.type} />

        {/* Recipient */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">
            {message.recipientName}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {truncateBody(message.body)}
          </div>
        </div>

        {/* Status */}
        <StatusBadge status={message.status} />

        {/* Time */}
        <div className="text-xs text-gray-500 hidden sm:block">
          {formatTime(message.sentAt || message.failedAt || message.createdAt)}
        </div>
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 py-3 bg-gray-900/50 border-t border-gray-700/30 space-y-3">
          {/* Contact Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Recipient:</span>
              <span className="ml-2 text-gray-300">{message.recipientName}</span>
            </div>
            <div>
              <span className="text-gray-500">Contact:</span>
              <span className="ml-2 text-gray-300">
                {message.type === 'sms' ? message.recipientPhone : message.recipientEmail}
              </span>
            </div>
          </div>

          {/* Subject (Email only) */}
          {message.type === 'email' && message.subject && (
            <div className="text-sm">
              <span className="text-gray-500">Subject:</span>
              <span className="ml-2 text-gray-300">{message.subject}</span>
            </div>
          )}

          {/* Body */}
          <div>
            <div className="text-gray-500 text-xs mb-1">Message:</div>
            <div className="text-sm text-gray-300 bg-gray-800/50 rounded p-2 whitespace-pre-wrap">
              {message.body}
            </div>
          </div>

          {/* Timestamps */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-gray-500">Created:</span>
              <span className="ml-2 text-gray-400">{formatTime(message.createdAt)}</span>
            </div>
            {message.sentAt && (
              <div>
                <span className="text-gray-500">Sent:</span>
                <span className="ml-2 text-green-400">{formatTime(message.sentAt)}</span>
              </div>
            )}
            {message.failedAt && (
              <div>
                <span className="text-gray-500">Failed:</span>
                <span className="ml-2 text-red-400">{formatTime(message.failedAt)}</span>
              </div>
            )}
          </div>

          {/* Error */}
          {message.error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
              <div className="text-red-400 text-xs font-medium">Error:</div>
              <div className="text-red-300 text-sm">{message.error}</div>
            </div>
          )}

          {/* Retry Info */}
          {message.retried && (
            <div className="text-xs text-yellow-400">
              This is a retry of message {message.retryOf}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Retry Button */}
            {message.status === 'failed' && !message.retried && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                disabled={isRetrying}
                className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-lg text-sm hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
              >
                {isRetrying ? (
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
            )}

            {/* Delete Button */}
            {(message.status === 'pending' || message.status === 'failed') && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                disabled={isDeleting}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors disabled:opacity-50"
              >
                {isDeleting ? (
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
        </div>
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const CommsHistorySection: React.FC<CommsHistorySectionProps> = ({
  tournamentId,
  messages,
  isLoading,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<CommsMessageStatus | 'all'>('all');
  const [filterType, setFilterType] = useState<CommsMessageType | 'all'>('all');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filter messages
  const filteredMessages = useMemo(() => {
    return messages.filter(m => {
      if (filterStatus !== 'all' && m.status !== filterStatus) return false;
      if (filterType !== 'all' && m.type !== filterType) return false;
      return true;
    });
  }, [messages, filterStatus, filterType]);

  // Handle retry
  const handleRetry = async (message: CommsQueueMessage & { id: string }) => {
    setRetryingId(message.id);
    try {
      await queueMessage(tournamentId, {
        type: message.type,
        recipientId: message.recipientId,
        recipientName: message.recipientName,
        recipientEmail: message.recipientEmail,
        recipientPhone: message.recipientPhone,
        body: message.body,
        subject: message.subject,
        templateId: message.templateId,
        templateData: message.templateData,
        tournamentId,
        divisionId: message.divisionId,
        poolGroup: message.poolGroup,
        matchId: message.matchId,
        createdBy: message.createdBy,
        retried: true,
        retryOf: message.id,
      });
    } catch (error) {
      console.error('Failed to retry message:', error);
    } finally {
      setRetryingId(null);
    }
  };

  // Handle delete
  const handleDelete = async (messageId: string) => {
    if (!confirm('Delete this message?')) return;
    setDeletingId(messageId);
    try {
      await deleteQueuedMessage(tournamentId, messageId);
    } catch (error) {
      console.error('Failed to delete message:', error);
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400 flex items-center gap-2">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading messages...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Status:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as CommsMessageStatus | 'all')}
            className="bg-gray-800/70 text-gray-300 text-sm px-3 py-1.5 rounded-lg border border-gray-700/50 focus:border-lime-500/50 outline-none"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Type:</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as CommsMessageType | 'all')}
            className="bg-gray-800/70 text-gray-300 text-sm px-3 py-1.5 rounded-lg border border-gray-700/50 focus:border-lime-500/50 outline-none"
          >
            <option value="all">All</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
          </select>
        </div>

        {/* Count */}
        <div className="ml-auto text-sm text-gray-500">
          {filteredMessages.length} message{filteredMessages.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Messages List */}
      {filteredMessages.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <div>No messages found</div>
          {(filterStatus !== 'all' || filterType !== 'all') && (
            <button
              onClick={() => {
                setFilterStatus('all');
                setFilterType('all');
              }}
              className="mt-2 text-lime-400 hover:underline text-sm"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredMessages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              isExpanded={expandedId === message.id}
              onToggle={() => setExpandedId(expandedId === message.id ? null : message.id)}
              onRetry={() => handleRetry(message)}
              onDelete={() => handleDelete(message.id)}
              isRetrying={retryingId === message.id}
              isDeleting={deletingId === message.id}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CommsHistorySection;
