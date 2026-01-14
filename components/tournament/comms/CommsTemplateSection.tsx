/**
 * CommsTemplateSection - Template Management
 *
 * Create, edit, and manage reusable message templates.
 * Uses token system for user-friendly field insertion.
 *
 * @file components/tournament/comms/CommsTemplateSection.tsx
 * @version 07.50
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  CommsTemplate,
  CommsTemplateCategory,
  CommsMessageType,
} from '../../../types';
import {
  getActiveTemplates,
  createTemplate,
  updateTemplate,
  deactivateTemplate,
} from '../../../services/firebase/comms';
import {
  TokenContext,
  TokenOptions,
  displayToStorage,
  storageToDisplay,
  extractTokens,
} from '../../../services/comms/tokens';
import { InsertFieldDropdown } from '../../shared/InsertFieldDropdown';

// ============================================
// TYPES
// ============================================

interface CommsTemplateSectionProps {
  currentUserId: string;
  /** Token context - determines which tokens are available */
  context?: TokenContext;
  /** Token options - e.g. hasMatchContext */
  tokenOptions?: TokenOptions;
}

// ============================================
// CONSTANTS
// ============================================

const CATEGORIES: { value: CommsTemplateCategory; label: string }[] = [
  { value: 'briefing', label: 'Day Briefing' },
  { value: 'score_reminder', label: 'Score Reminder' },
  { value: 'match_notification', label: 'Match Notification' },
  { value: 'court_assignment', label: 'Court Assignment' },
  { value: 'results', label: 'Results' },
  { value: 'custom', label: 'Custom' },
];


// ============================================
// TEMPLATE CARD
// ============================================

interface TemplateCardProps {
  template: CommsTemplate & { id: string };
  onEdit: () => void;
  onDeactivate: () => void;
  context: TokenContext;
  tokenOptions?: TokenOptions;
}

const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  onEdit,
  onDeactivate,
  context,
  tokenOptions,
}) => {
  const categoryLabel = CATEGORIES.find(c => c.value === template.category)?.label || template.category;

  // Convert to display format for preview
  const displayBody = storageToDisplay(template.body, context, tokenOptions);
  const displaySubject = template.subject ? storageToDisplay(template.subject, context, tokenOptions) : '';

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl overflow-hidden hover:border-gray-600/50 transition-colors">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700/30 flex items-center justify-between">
        <div>
          <h4 className="text-white font-medium">{template.name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded ${
              template.type === 'sms'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-purple-500/20 text-purple-400'
            }`}>
              {template.type.toUpperCase()}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">
              {categoryLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={onDeactivate}
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Deactivate"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="px-4 py-3">
        {template.type === 'email' && displaySubject && (
          <div className="text-xs text-gray-500 mb-1">
            Subject: <span className="text-gray-400">{displaySubject}</span>
          </div>
        )}
        <div className="text-sm text-gray-300 line-clamp-3 whitespace-pre-wrap">
          {displayBody}
        </div>
      </div>
    </div>
  );
};

// ============================================
// TEMPLATE MODAL
// ============================================

interface TemplateModalProps {
  template?: CommsTemplate & { id: string };
  onSave: (data: Omit<CommsTemplate, 'createdAt' | 'updatedAt'>) => Promise<void>;
  onClose: () => void;
  currentUserId: string;
  context: TokenContext;
  tokenOptions?: TokenOptions;
}

const TemplateModal: React.FC<TemplateModalProps> = ({
  template,
  onSave,
  onClose,
  currentUserId,
  context,
  tokenOptions,
}) => {
  const [name, setName] = useState(template?.name || '');
  const [type, setType] = useState<CommsMessageType>(template?.type || 'sms');
  const [category, setCategory] = useState<CommsTemplateCategory>(template?.category || 'custom');
  // Convert storage format to display format on load
  const [subject, setSubject] = useState(
    template?.subject ? storageToDisplay(template.subject, context, tokenOptions) : ''
  );
  const [body, setBody] = useState(
    template?.body ? storageToDisplay(template.body, context, tokenOptions) : ''
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for textarea cursor positioning
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  // Extract variables from storage format (for saved templates)
  const variables = [...new Set([
    ...extractTokens(displayToStorage(body, context, tokenOptions)),
    ...extractTokens(displayToStorage(subject, context, tokenOptions)),
  ])];

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
    // Restore focus and cursor position after token insertion
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

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) return;

    setIsSaving(true);
    setError(null);
    try {
      // Convert display format back to storage format for saving
      const storageBody = displayToStorage(body.trim(), context, tokenOptions);
      const storageSubject = type === 'email' ? displayToStorage(subject.trim(), context, tokenOptions) : null;

      const templateData = {
        name: name.trim(),
        type,
        category,
        subject: storageSubject,
        body: storageBody,
        variables: extractTokens(storageBody + (storageSubject || '')),
        isActive: true,
        createdBy: template?.createdBy || currentUserId,
      };
      console.log('Saving template with data:', templateData);
      await onSave(templateData);
      onClose();
    } catch (err: any) {
      console.error('Failed to save template:', err);
      setError(err?.message || 'Failed to save template. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between sticky top-0 bg-gray-800">
          <h3 className="text-lg font-bold text-white">
            {template ? 'Edit Template' : 'New Template'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
              Template Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Day 1 Briefing"
              className="w-full bg-gray-700/50 text-white px-3 py-2.5 rounded-lg border border-gray-600/50 focus:border-lime-500/50 outline-none text-sm"
            />
          </div>

          {/* Type & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CommsMessageType)}
                className="w-full bg-gray-700/50 text-white px-3 py-2.5 rounded-lg border border-gray-600/50 focus:border-lime-500/50 outline-none text-sm"
              >
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CommsTemplateCategory)}
                className="w-full bg-gray-700/50 text-white px-3 py-2.5 rounded-lg border border-gray-600/50 focus:border-lime-500/50 outline-none text-sm"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Subject (Email only) */}
          {type === 'email' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Subject
                </label>
                <InsertFieldDropdown
                  context={context}
                  options={tokenOptions}
                  onInsert={handleInsertSubjectToken}
                />
              </div>
              <input
                ref={subjectRef}
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., [Event Name] - Day 1 Schedule"
                className="w-full bg-gray-700/50 text-white px-3 py-2.5 rounded-lg border border-gray-600/50 focus:border-lime-500/50 outline-none text-sm"
              />
            </div>
          )}

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Message Body
              </label>
              <InsertFieldDropdown
                context={context}
                options={tokenOptions}
                onInsert={handleInsertBodyToken}
              />
            </div>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Enter your message template..."
              rows={type === 'sms' ? 4 : 8}
              className="w-full bg-gray-700/50 text-white px-3 py-2.5 rounded-lg border border-gray-600/50 focus:border-lime-500/50 outline-none text-sm resize-none"
            />
          </div>

          {/* Detected Variables */}
          {variables.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                Detected Variables
              </label>
              <div className="flex flex-wrap gap-1">
                {variables.map(v => (
                  <span key={v} className="text-xs px-2 py-1 bg-lime-500/20 text-lime-400 rounded">
                    {`{{${v}}}`}
                  </span>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 sticky bottom-0 bg-gray-800">
          {error && (
            <div className="mb-3 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || !body.trim() || isSaving}
              className="px-4 py-2 bg-lime-500 text-gray-900 rounded-lg font-medium hover:bg-lime-400 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : template ? 'Update Template' : 'Create Template'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const CommsTemplateSection: React.FC<CommsTemplateSectionProps> = ({
  currentUserId,
  context = 'tournament',
  tokenOptions,
}) => {
  const [templates, setTemplates] = useState<(CommsTemplate & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<(CommsTemplate & { id: string }) | null>(null);
  const [filterType, setFilterType] = useState<CommsMessageType | 'all'>('all');

  // Load templates for current user only
  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const data = await getActiveTemplates(currentUserId);
      setTemplates(data);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [currentUserId]);

  // Filter templates
  const filteredTemplates = filterType === 'all'
    ? templates
    : templates.filter(t => t.type === filterType);

  // Handle create
  const handleCreate = async (data: Omit<CommsTemplate, 'createdAt' | 'updatedAt'>) => {
    await createTemplate(data);
    await loadTemplates();
  };

  // Handle update
  const handleUpdate = async (data: Omit<CommsTemplate, 'createdAt' | 'updatedAt'>) => {
    if (!editingTemplate) return;
    await updateTemplate(editingTemplate.id, data);
    await loadTemplates();
  };

  // Handle deactivate
  const handleDeactivate = async (templateId: string) => {
    if (!confirm('Are you sure you want to deactivate this template?')) return;
    await deactivateTemplate(templateId);
    await loadTemplates();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400 flex items-center gap-2">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading templates...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">Filter:</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as CommsMessageType | 'all')}
            className="bg-gray-800/70 text-gray-300 text-sm px-3 py-1.5 rounded-lg border border-gray-700/50 focus:border-lime-500/50 outline-none"
          >
            <option value="all">All Types</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
          </select>
        </div>

        <button
          onClick={() => {
            setEditingTemplate(null);
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-lime-500/20 text-lime-400 rounded-lg text-sm font-medium hover:bg-lime-500/30 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Template
        </button>
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
          </svg>
          <div>No templates found</div>
          <button
            onClick={() => {
              setEditingTemplate(null);
              setShowModal(true);
            }}
            className="mt-2 text-lime-400 hover:underline text-sm"
          >
            Create your first template
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredTemplates.map(template => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={() => {
                setEditingTemplate(template);
                setShowModal(true);
              }}
              onDeactivate={() => handleDeactivate(template.id)}
              context={context}
              tokenOptions={tokenOptions}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <TemplateModal
          template={editingTemplate || undefined}
          onSave={editingTemplate ? handleUpdate : handleCreate}
          onClose={() => {
            setShowModal(false);
            setEditingTemplate(null);
          }}
          currentUserId={currentUserId}
          context={context}
          tokenOptions={tokenOptions}
        />
      )}
    </div>
  );
};

export default CommsTemplateSection;
