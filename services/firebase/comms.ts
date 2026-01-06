/**
 * Communications Service
 *
 * Firebase service for managing tournament and league communications:
 * - comms_templates: Reusable message templates (shared)
 * - tournaments/{id}/comms_queue: Per-tournament message queue
 * - leagues/{id}/comms_queue: Per-league message queue
 *
 * FILE LOCATION: services/firebase/comms.ts
 * VERSION: 07.17
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
  limit,
  type Unsubscribe,
} from '@firebase/firestore';
import { db } from './config';
import type {
  CommsTemplate,
  CommsTemplateCategory,
  CommsQueueMessage,
  CommsMessageType,
  CommsMessageStatus,
} from '../../types';

// ============================================
// TEMPLATE CRUD
// Collection: comms_templates/{templateId}
// ============================================

/**
 * Create a new message template
 */
export const createTemplate = async (
  template: Omit<CommsTemplate, 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const templateRef = doc(collection(db, 'comms_templates'));
  const now = Date.now();

  await setDoc(templateRef, {
    ...template,
    createdAt: now,
    updatedAt: now,
  });

  return templateRef.id;
};

/**
 * Get a template by ID
 */
export const getTemplate = async (templateId: string): Promise<CommsTemplate | null> => {
  const snap = await getDoc(doc(db, 'comms_templates', templateId));
  return snap.exists() ? (snap.data() as CommsTemplate) : null;
};

/**
 * Get all active templates
 */
export const getActiveTemplates = async (): Promise<(CommsTemplate & { id: string })[]> => {
  const q = query(
    collection(db, 'comms_templates'),
    where('isActive', '==', true),
    orderBy('name', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommsTemplate & { id: string }));
};

/**
 * Get templates by category
 */
export const getTemplatesByCategory = async (
  category: CommsTemplateCategory
): Promise<(CommsTemplate & { id: string })[]> => {
  const q = query(
    collection(db, 'comms_templates'),
    where('category', '==', category),
    where('isActive', '==', true),
    orderBy('name', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommsTemplate & { id: string }));
};

/**
 * Get templates by type (sms or email)
 */
export const getTemplatesByType = async (
  type: CommsMessageType
): Promise<(CommsTemplate & { id: string })[]> => {
  const q = query(
    collection(db, 'comms_templates'),
    where('type', '==', type),
    where('isActive', '==', true),
    orderBy('name', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommsTemplate & { id: string }));
};

/**
 * Update a template
 */
export const updateTemplate = async (
  templateId: string,
  updates: Partial<CommsTemplate>
): Promise<void> => {
  const templateRef = doc(db, 'comms_templates', templateId);

  // Filter out undefined values
  const cleanedUpdates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      cleanedUpdates[key] = value;
    }
  }

  await updateDoc(templateRef, {
    ...cleanedUpdates,
    updatedAt: Date.now(),
  });
};

/**
 * Deactivate a template (soft delete)
 */
export const deactivateTemplate = async (templateId: string): Promise<void> => {
  await updateTemplate(templateId, { isActive: false });
};

// ============================================
// QUEUE CRUD
// Collection: tournaments/{tournamentId}/comms_queue/{messageId}
// ============================================

/**
 * Queue a new message for sending
 */
export const queueMessage = async (
  tournamentId: string,
  message: Omit<CommsQueueMessage, 'createdAt' | 'status' | 'sentAt' | 'failedAt' | 'error' | 'lockedAt' | 'lockedBy'>
): Promise<string> => {
  const queueRef = doc(collection(db, 'tournaments', tournamentId, 'comms_queue'));
  const now = Date.now();

  // Clean undefined values - Firestore doesn't allow undefined
  const cleanedMessage: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(message)) {
    cleanedMessage[key] = value === undefined ? null : value;
  }

  const queueMessage: CommsQueueMessage = {
    ...cleanedMessage,
    tournamentId,
    status: 'pending',
    createdAt: now,
    sentAt: null,
    failedAt: null,
    error: null,
    lockedAt: null,
    lockedBy: null,
  } as CommsQueueMessage;

  await setDoc(queueRef, queueMessage);
  return queueRef.id;
};

/**
 * Get a queued message by ID
 */
export const getQueuedMessage = async (
  tournamentId: string,
  messageId: string
): Promise<(CommsQueueMessage & { id: string }) | null> => {
  const snap = await getDoc(doc(db, 'tournaments', tournamentId, 'comms_queue', messageId));
  return snap.exists()
    ? ({ id: snap.id, ...snap.data() } as CommsQueueMessage & { id: string })
    : null;
};

/**
 * Get all messages for a tournament (queue + history)
 */
export const getTournamentMessages = async (
  tournamentId: string,
  options?: {
    status?: CommsMessageStatus;
    type?: CommsMessageType;
    limitCount?: number;
  }
): Promise<(CommsQueueMessage & { id: string })[]> => {
  let q = query(
    collection(db, 'tournaments', tournamentId, 'comms_queue'),
    orderBy('createdAt', 'desc')
  );

  // Note: Multiple where clauses require composite indexes
  // For MVP, filter in JavaScript after fetching
  if (options?.limitCount) {
    q = query(q, limit(options.limitCount));
  }

  const snap = await getDocs(q);
  let messages = snap.docs.map(
    (d) => ({ id: d.id, ...d.data() } as CommsQueueMessage & { id: string })
  );

  // Client-side filtering (avoids composite index requirements for MVP)
  if (options?.status) {
    messages = messages.filter((m) => m.status === options.status);
  }
  if (options?.type) {
    messages = messages.filter((m) => m.type === options.type);
  }

  return messages;
};

/**
 * Subscribe to tournament messages (real-time)
 */
export const subscribeToTournamentMessages = (
  tournamentId: string,
  callback: (messages: (CommsQueueMessage & { id: string })[]) => void
): Unsubscribe => {
  const q = query(
    collection(db, 'tournaments', tournamentId, 'comms_queue'),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as CommsQueueMessage & { id: string })
    );
    callback(messages);
  });
};

/**
 * Delete a pending or failed message from the queue
 * Sent messages cannot be deleted (for audit trail)
 */
export const deleteQueuedMessage = async (
  tournamentId: string,
  messageId: string
): Promise<void> => {
  const message = await getQueuedMessage(tournamentId, messageId);
  if (message?.status === 'sent') {
    throw new Error('Sent messages cannot be deleted');
  }
  await deleteDoc(doc(db, 'tournaments', tournamentId, 'comms_queue', messageId));
};

// ============================================
// LEAGUE QUEUE CRUD
// Collection: leagues/{leagueId}/comms_queue/{messageId}
// ============================================

/**
 * Queue a new message for sending (league)
 */
export const queueLeagueMessage = async (
  leagueId: string,
  message: Omit<CommsQueueMessage, 'createdAt' | 'status' | 'sentAt' | 'failedAt' | 'error' | 'lockedAt' | 'lockedBy'>
): Promise<string> => {
  const queueRef = doc(collection(db, 'leagues', leagueId, 'comms_queue'));
  const now = Date.now();

  // Clean undefined values - Firestore doesn't allow undefined
  const cleanedMessage: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(message)) {
    cleanedMessage[key] = value === undefined ? null : value;
  }

  const queueMessage: CommsQueueMessage = {
    ...cleanedMessage,
    leagueId,
    status: 'pending',
    createdAt: now,
    sentAt: null,
    failedAt: null,
    error: null,
    lockedAt: null,
    lockedBy: null,
  } as CommsQueueMessage;

  await setDoc(queueRef, queueMessage);
  return queueRef.id;
};

/**
 * Get a queued message by ID (league)
 */
export const getQueuedLeagueMessage = async (
  leagueId: string,
  messageId: string
): Promise<(CommsQueueMessage & { id: string }) | null> => {
  const snap = await getDoc(doc(db, 'leagues', leagueId, 'comms_queue', messageId));
  return snap.exists()
    ? ({ id: snap.id, ...snap.data() } as CommsQueueMessage & { id: string })
    : null;
};

/**
 * Get all messages for a league (queue + history)
 */
export const getLeagueMessages = async (
  leagueId: string,
  options?: {
    status?: CommsMessageStatus;
    type?: CommsMessageType;
    limitCount?: number;
  }
): Promise<(CommsQueueMessage & { id: string })[]> => {
  let q = query(
    collection(db, 'leagues', leagueId, 'comms_queue'),
    orderBy('createdAt', 'desc')
  );

  if (options?.limitCount) {
    q = query(q, limit(options.limitCount));
  }

  const snap = await getDocs(q);
  let messages = snap.docs.map(
    (d) => ({ id: d.id, ...d.data() } as CommsQueueMessage & { id: string })
  );

  // Client-side filtering (avoids composite index requirements)
  if (options?.status) {
    messages = messages.filter((m) => m.status === options.status);
  }
  if (options?.type) {
    messages = messages.filter((m) => m.type === options.type);
  }

  return messages;
};

/**
 * Subscribe to league messages (real-time)
 */
export const subscribeToLeagueMessages = (
  leagueId: string,
  callback: (messages: (CommsQueueMessage & { id: string })[]) => void
): Unsubscribe => {
  const q = query(
    collection(db, 'leagues', leagueId, 'comms_queue'),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as CommsQueueMessage & { id: string })
    );
    callback(messages);
  });
};

/**
 * Delete a pending or failed message from the league queue
 * Sent messages cannot be deleted (for audit trail)
 */
export const deleteLeagueQueuedMessage = async (
  leagueId: string,
  messageId: string
): Promise<void> => {
  const message = await getQueuedLeagueMessage(leagueId, messageId);
  if (message?.status === 'sent') {
    throw new Error('Sent messages cannot be deleted');
  }
  await deleteDoc(doc(db, 'leagues', leagueId, 'comms_queue', messageId));
};

// ============================================
// TEMPLATE RENDERING
// ============================================

/**
 * Render a template with data
 * Replaces {{placeholder}} with values from data object
 */
export const renderTemplate = (
  template: string,
  data: Record<string, string>
): string => {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
};

/**
 * Render a full template (subject + body)
 */
export const renderFullTemplate = (
  template: CommsTemplate,
  data: Record<string, string>
): { subject: string | null; body: string } => {
  return {
    subject: template.subject ? renderTemplate(template.subject, data) : null,
    body: renderTemplate(template.body, data),
  };
};

/**
 * Validate that all required variables are provided
 */
export const validateTemplateData = (
  template: CommsTemplate,
  data: Record<string, string>
): { valid: boolean; missing: string[] } => {
  const missing = template.variables.filter((v) => !data[v]);
  return {
    valid: missing.length === 0,
    missing,
  };
};

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * Queue messages for multiple recipients
 * Returns array of created message IDs
 */
export const queueBulkMessages = async (
  tournamentId: string,
  recipients: Array<{
    recipientId: string;
    recipientName: string;
    recipientEmail: string | null;
    recipientPhone: string | null;
  }>,
  messageConfig: {
    type: CommsMessageType;
    templateId?: string;
    templateData?: Record<string, string>;
    subject?: string;
    body: string;
    divisionId?: string;
    poolGroup?: string;
    matchId?: string;
    createdBy: string;
  }
): Promise<string[]> => {
  const messageIds: string[] = [];

  for (const recipient of recipients) {
    // Skip if recipient doesn't have required contact info
    if (messageConfig.type === 'sms' && !recipient.recipientPhone) continue;
    if (messageConfig.type === 'email' && !recipient.recipientEmail) continue;

    const messageId = await queueMessage(tournamentId, {
      type: messageConfig.type,
      recipientId: recipient.recipientId,
      recipientName: recipient.recipientName,
      recipientEmail: recipient.recipientEmail,
      recipientPhone: recipient.recipientPhone,
      body: messageConfig.body,
      subject: messageConfig.subject,
      templateId: messageConfig.templateId,
      templateData: messageConfig.templateData,
      tournamentId,
      divisionId: messageConfig.divisionId,
      poolGroup: messageConfig.poolGroup,
      matchId: messageConfig.matchId,
      createdBy: messageConfig.createdBy,
      retried: false,
      retryOf: null,
    });

    messageIds.push(messageId);
  }

  return messageIds;
};

// ============================================
// STATISTICS
// ============================================

/**
 * Get message statistics for a tournament
 */
export const getMessageStats = async (
  tournamentId: string
): Promise<{
  total: number;
  pending: number;
  sent: number;
  failed: number;
  bySms: number;
  byEmail: number;
}> => {
  const messages = await getTournamentMessages(tournamentId);

  return {
    total: messages.length,
    pending: messages.filter((m) => m.status === 'pending').length,
    sent: messages.filter((m) => m.status === 'sent').length,
    failed: messages.filter((m) => m.status === 'failed').length,
    bySms: messages.filter((m) => m.type === 'sms').length,
    byEmail: messages.filter((m) => m.type === 'email').length,
  };
};

// ============================================
// LEAGUE BULK OPERATIONS
// ============================================

/**
 * Queue messages for multiple recipients (league)
 * Returns array of created message IDs
 */
export const queueBulkLeagueMessages = async (
  leagueId: string,
  recipients: Array<{
    recipientId: string;
    recipientName: string;
    recipientEmail: string | null;
    recipientPhone: string | null;
  }>,
  messageConfig: {
    type: CommsMessageType;
    templateId?: string | null;
    templateData?: Record<string, string> | null;
    subject?: string | null;
    body: string;
    divisionId?: string | null;
    matchId?: string | null;
    createdBy: string;
  }
): Promise<string[]> => {
  const messageIds: string[] = [];

  for (const recipient of recipients) {
    // Skip if recipient doesn't have required contact info
    if (messageConfig.type === 'sms' && !recipient.recipientPhone) continue;
    if (messageConfig.type === 'email' && !recipient.recipientEmail) continue;

    const messageId = await queueLeagueMessage(leagueId, {
      type: messageConfig.type,
      recipientId: recipient.recipientId,
      recipientName: recipient.recipientName,
      recipientEmail: recipient.recipientEmail,
      recipientPhone: recipient.recipientPhone,
      body: messageConfig.body,
      subject: messageConfig.subject,
      templateId: messageConfig.templateId,
      templateData: messageConfig.templateData,
      leagueId,
      divisionId: messageConfig.divisionId,
      matchId: messageConfig.matchId,
      createdBy: messageConfig.createdBy,
      retried: false,
      retryOf: null,
    });

    messageIds.push(messageId);
  }

  return messageIds;
};

// ============================================
// LEAGUE STATISTICS
// ============================================

/**
 * Get message statistics for a league
 */
export const getLeagueMessageStats = async (
  leagueId: string
): Promise<{
  total: number;
  pending: number;
  sent: number;
  failed: number;
  bySms: number;
  byEmail: number;
}> => {
  const messages = await getLeagueMessages(leagueId);

  return {
    total: messages.length,
    pending: messages.filter((m) => m.status === 'pending').length,
    sent: messages.filter((m) => m.status === 'sent').length,
    failed: messages.filter((m) => m.status === 'failed').length,
    bySms: messages.filter((m) => m.type === 'sms').length,
    byEmail: messages.filter((m) => m.type === 'email').length,
  };
};
