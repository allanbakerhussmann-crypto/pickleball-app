/**
 * CommsComposeSection - Message Composition Form
 *
 * Allows composing and sending SMS/Email messages to tournament players.
 * Uses token system for user-friendly field insertion.
 *
 * @file components/tournament/comms/CommsComposeSection.tsx
 * @version 07.50
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Tournament, Division, Team, UserProfile, CommsMessageType, CommsTemplate } from '../../../types';
import { queueBulkMessages, getActiveTemplates, renderTemplate } from '../../../services/firebase/comms';
import { RecipientPicker, Recipient } from './RecipientPicker';
import { displayToStorage, storageToDisplay } from '../../../services/comms/tokens';
import { InsertFieldDropdown } from '../../shared/InsertFieldDropdown';

// ============================================
// TYPES
// ============================================

interface CommsComposeSectionProps {
  tournament: Tournament;
  divisions: Division[];
  teams: Team[];
  players: UserProfile[];
  currentUserId: string;
  onMessageSent: () => void;
}

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
// MAIN COMPONENT
// ============================================

export const CommsComposeSection: React.FC<CommsComposeSectionProps> = ({
  tournament,
  divisions,
  teams,
  players,
  currentUserId,
  onMessageSent,
}) => {
  // Form state
  const [messageType, setMessageType] = useState<CommsMessageType>('sms');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Refs for cursor positioning
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  // Templates
  const [templates, setTemplates] = useState<(CommsTemplate & { id: string })[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);

  // Sending state
  const [isSending, setIsSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; count: number } | null>(null);

  // Load templates for current user
  useEffect(() => {
    const loadTemplates = async () => {
      if (!currentUserId) return;
      try {
        const allTemplates = await getActiveTemplates(currentUserId);
        setTemplates(allTemplates.filter(t => t.type === messageType));
      } catch (error) {
        console.error('Failed to load templates:', error);
      } finally {
        setIsLoadingTemplates(false);
      }
    };
    loadTemplates();
  }, [messageType, currentUserId]);

  // Filter templates by type
  const filteredTemplates = useMemo(() => {
    return templates.filter(t => t.type === messageType);
  }, [templates, messageType]);

  // Apply template
  useEffect(() => {
    if (!selectedTemplateId) return;

    const template = templates.find(t => t.id === selectedTemplateId);
    if (template) {
      // Basic template data for event-level tokens
      const templateData: Record<string, string> = {
        eventName: tournament.name,
        tournamentName: tournament.name,
        venueName: tournament.location || '',
      };

      // Render event-level tokens and convert to display format
      const renderedBody = renderTemplate(template.body, templateData);
      const renderedSubject = template.subject ? renderTemplate(template.subject, templateData) : '';

      setSubject(storageToDisplay(renderedSubject, 'tournament'));
      setBody(storageToDisplay(renderedBody, 'tournament'));
    }
  }, [selectedTemplateId, templates, tournament]);

  // Insert token at cursor position in body textarea
  const handleInsertBodyToken = (displayText: string) => {
    const textarea = bodyRef.current;
    if (!textarea) {
      setBody(body + displayText);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newBody = body.substring(0, start) + displayText + body.substring(end);
    setBody(newBody);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + displayText.length, start + displayText.length);
    }, 0);
  };

  // Insert token at cursor position in subject input
  const handleInsertSubjectToken = (displayText: string) => {
    const input = subjectRef.current;
    if (!input) {
      setSubject(subject + displayText);
      return;
    }
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const newSubject = subject.substring(0, start) + displayText + subject.substring(end);
    setSubject(newSubject);
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + displayText.length, start + displayText.length);
    }, 0);
  };

  // Clear form when type changes
  useEffect(() => {
    setRecipients([]);
    setSelectedTemplateId('');
    setSubject('');
    setBody('');
    setSendResult(null);
  }, [messageType]);

  // Validation
  const isValid = useMemo(() => {
    if (recipients.length === 0) return false;
    if (!body.trim()) return false;
    if (messageType === 'email' && !subject.trim()) return false;
    if (messageType === 'sms' && body.length > SMS_CHAR_LIMIT * SMS_MAX_SEGMENTS) return false;
    return true;
  }, [recipients, body, subject, messageType]);

  // Handle send
  const handleSend = async () => {
    if (!isValid) return;

    setIsSending(true);
    setSendResult(null);

    try {
      // Convert display format back to storage format for sending
      const storageBody = displayToStorage(body, 'tournament');
      const storageSubject = messageType === 'email' ? displayToStorage(subject, 'tournament') : undefined;

      const messageIds = await queueBulkMessages(
        tournament.id,
        recipients,
        {
          type: messageType,
          templateId: selectedTemplateId || undefined,
          subject: storageSubject,
          body: storageBody,
          createdBy: currentUserId,
        }
      );

      setSendResult({ success: true, count: messageIds.length });
      setShowConfirm(false);

      // Reset form after successful send
      setRecipients([]);
      setSubject('');
      setBody('');
      setSelectedTemplateId('');

      onMessageSent();
    } catch (error) {
      console.error('Failed to send messages:', error);
      setSendResult({ success: false, count: 0 });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Success/Error Message */}
      {sendResult && (
        <div className={`p-4 rounded-lg border ${
          sendResult.success
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {sendResult.success ? (
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Queued {sendResult.count} message{sendResult.count !== 1 ? 's' : ''} for delivery
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Failed to send messages. Please try again.
            </div>
          )}
        </div>
      )}

      {/* Message Type */}
      <div>
        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
          Message Type
        </label>
        <TypeToggle type={messageType} onChange={setMessageType} />
      </div>

      {/* Recipients */}
      <div>
        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
          Recipients
        </label>
        <div className="bg-gray-800/30 rounded-xl border border-gray-700/50 p-4">
          <RecipientPicker
            divisions={divisions}
            teams={teams}
            players={players}
            messageType={messageType}
            selectedRecipients={recipients}
            onRecipientsChange={setRecipients}
          />
        </div>
      </div>

      {/* Template Selector */}
      <div>
        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
          Template (Optional)
        </label>
        <select
          value={selectedTemplateId}
          onChange={(e) => setSelectedTemplateId(e.target.value)}
          disabled={isLoadingTemplates}
          className="w-full bg-gray-800/70 text-white px-3 py-2.5 rounded-lg border border-gray-700/50 focus:border-lime-500/50 outline-none text-sm"
        >
          <option value="">No template - write custom message</option>
          {filteredTemplates.map(template => (
            <option key={template.id} value={template.id}>
              {template.name} ({template.category})
            </option>
          ))}
        </select>
      </div>

      {/* Subject (Email only) */}
      {messageType === 'email' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Subject
            </label>
            <InsertFieldDropdown
              context="tournament"
              onInsert={handleInsertSubjectToken}
            />
          </div>
          <input
            ref={subjectRef}
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Enter email subject..."
            className="w-full bg-gray-800/70 text-white px-3 py-2.5 rounded-lg border border-gray-700/50 focus:border-lime-500/50 outline-none text-sm placeholder-gray-500"
          />
        </div>
      )}

      {/* Message Body */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Message
          </label>
          <div className="flex items-center gap-3">
            <InsertFieldDropdown
              context="tournament"
              onInsert={handleInsertBodyToken}
            />
            {messageType === 'sms' && (
              <CharCounter
                current={body.length}
                limit={SMS_CHAR_LIMIT}
                warning={SMS_CHAR_WARNING}
              />
            )}
          </div>
        </div>
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={messageType === 'sms' ? 'Enter SMS message...' : 'Enter email body...'}
          rows={messageType === 'sms' ? 4 : 8}
          className="w-full bg-gray-800/70 text-white px-3 py-2.5 rounded-lg border border-gray-700/50 focus:border-lime-500/50 outline-none text-sm placeholder-gray-500 resize-none"
        />
        {messageType === 'sms' && body.length > SMS_CHAR_LIMIT && (
          <p className="text-xs text-yellow-400 mt-1">
            Messages over 160 characters will be sent as multiple SMS segments (higher cost).
          </p>
        )}
      </div>

      {/* Send Button */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-700/50">
        <div className="text-sm text-gray-500">
          {recipients.length > 0 ? (
            <>Sending to <span className="text-lime-400 font-medium">{recipients.length}</span> recipient{recipients.length !== 1 ? 's' : ''}</>
          ) : (
            'Select recipients to continue'
          )}
        </div>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={!isValid || isSending}
          className="flex items-center gap-2 px-6 py-2.5 bg-lime-500 text-gray-900 rounded-lg font-medium hover:bg-lime-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSending ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Sending...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send {messageType.toUpperCase()}
            </>
          )}
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Confirm Send</h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Type:</span>
                <span className="text-white font-medium">{messageType.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Recipients:</span>
                <span className="text-lime-400 font-medium">{recipients.length}</span>
              </div>
              {messageType === 'email' && (
                <div>
                  <span className="text-gray-400">Subject:</span>
                  <div className="text-white mt-1">{subject}</div>
                </div>
              )}
              <div>
                <span className="text-gray-400">Message:</span>
                <div className="text-white mt-1 bg-gray-700/50 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs">
                  {body}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={isSending}
                className="flex-1 px-4 py-2 bg-lime-500 text-gray-900 rounded-lg font-medium hover:bg-lime-400 transition-colors disabled:opacity-50"
              >
                {isSending ? 'Sending...' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommsComposeSection;
