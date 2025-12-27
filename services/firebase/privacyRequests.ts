/**
 * Privacy Requests Service - Privacy Act 2020 Compliance
 *
 * Stores and manages privacy requests (access, correction, deletion, questions)
 * submitted by users through the Privacy Request form.
 *
 * FILE LOCATION: services/firebase/privacyRequests.ts
 * VERSION: V06.04
 */

import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  Timestamp,
} from '@firebase/firestore';
import { db } from './config';

// ============================================
// TYPES
// ============================================

export type PrivacyRequestType = 'access' | 'correction' | 'deletion' | 'question';
export type PrivacyRequestStatus = 'pending' | 'in_progress' | 'approved' | 'rejected' | 'completed';

export interface PrivacyRequest {
  id: string;
  requestType: PrivacyRequestType;
  status: PrivacyRequestStatus;

  // Requester info
  userId?: string; // If logged in
  name: string;
  email: string;
  details: string;

  // Processing info
  processedBy?: string;
  processedAt?: number;
  processingNotes?: string;

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

export interface CreatePrivacyRequestInput {
  requestType: PrivacyRequestType;
  name: string;
  email: string;
  details: string;
  userId?: string;
}

// ============================================
// CREATE
// ============================================

/**
 * Generate a unique request ID
 */
const generateRequestId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `PR-${timestamp}-${random}`.toUpperCase();
};

/**
 * Submit a new privacy request
 */
export const createPrivacyRequest = async (
  input: CreatePrivacyRequestInput
): Promise<PrivacyRequest> => {
  const requestId = generateRequestId();
  const now = Date.now();

  const request: PrivacyRequest = {
    id: requestId,
    requestType: input.requestType,
    status: 'pending',
    userId: input.userId,
    name: input.name,
    email: input.email,
    details: input.details,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'privacy_requests', requestId), request);

  return request;
};

// ============================================
// READ
// ============================================

/**
 * Get a privacy request by ID
 */
export const getPrivacyRequest = async (requestId: string): Promise<PrivacyRequest | null> => {
  const requestDoc = await getDoc(doc(db, 'privacy_requests', requestId));
  if (!requestDoc.exists()) return null;
  return requestDoc.data() as PrivacyRequest;
};

/**
 * Get all privacy requests (admin only)
 */
export const getAllPrivacyRequests = async (
  limitCount: number = 50,
  statusFilter?: PrivacyRequestStatus
): Promise<PrivacyRequest[]> => {
  let q = query(
    collection(db, 'privacy_requests'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  if (statusFilter) {
    q = query(
      collection(db, 'privacy_requests'),
      where('status', '==', statusFilter),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as PrivacyRequest);
};

/**
 * Get pending privacy requests count
 */
export const getPendingPrivacyRequestsCount = async (): Promise<number> => {
  const q = query(
    collection(db, 'privacy_requests'),
    where('status', '==', 'pending')
  );
  const snapshot = await getDocs(q);
  return snapshot.size;
};

/**
 * Get privacy requests for a specific user
 */
export const getUserPrivacyRequests = async (userId: string): Promise<PrivacyRequest[]> => {
  const q = query(
    collection(db, 'privacy_requests'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as PrivacyRequest);
};

// ============================================
// UPDATE
// ============================================

/**
 * Update privacy request status
 */
export const updatePrivacyRequestStatus = async (
  requestId: string,
  status: PrivacyRequestStatus,
  processedByUserId: string,
  notes?: string
): Promise<void> => {
  const now = Date.now();

  await updateDoc(doc(db, 'privacy_requests', requestId), {
    status,
    processedBy: processedByUserId,
    processedAt: now,
    processingNotes: notes || null,
    updatedAt: now,
  });
};

/**
 * Add processing notes to a request
 */
export const addPrivacyRequestNotes = async (
  requestId: string,
  notes: string,
  updatedByUserId: string
): Promise<void> => {
  await updateDoc(doc(db, 'privacy_requests', requestId), {
    processingNotes: notes,
    updatedBy: updatedByUserId,
    updatedAt: Date.now(),
  });
};

// ============================================
// HELPERS
// ============================================

/**
 * Get request type label
 */
export const getRequestTypeLabel = (type: PrivacyRequestType): string => {
  const labels: Record<PrivacyRequestType, string> = {
    access: 'Data Access Request',
    correction: 'Data Correction Request',
    deletion: 'Account Deletion Request',
    question: 'Privacy Question',
  };
  return labels[type];
};

/**
 * Get status badge color
 */
export const getStatusColor = (status: PrivacyRequestStatus): string => {
  const colors: Record<PrivacyRequestStatus, string> = {
    pending: 'bg-yellow-600',
    in_progress: 'bg-blue-600',
    approved: 'bg-green-600',
    rejected: 'bg-red-600',
    completed: 'bg-purple-600',
  };
  return colors[status];
};

/**
 * Calculate response deadline (20 working days from creation)
 */
export const calculateResponseDeadline = (createdAt: number): Date => {
  const created = new Date(createdAt);
  let workingDays = 0;
  const deadline = new Date(created);

  while (workingDays < 20) {
    deadline.setDate(deadline.getDate() + 1);
    const dayOfWeek = deadline.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++;
    }
  }

  return deadline;
};

/**
 * Check if request is overdue
 */
export const isRequestOverdue = (createdAt: number): boolean => {
  const deadline = calculateResponseDeadline(createdAt);
  return new Date() > deadline;
};
