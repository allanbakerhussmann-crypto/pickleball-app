/**
 * Organizer Requests Service V07.05
 *
 * Manages requests from players who want to become organizers.
 * Admins can approve or deny requests from the admin panel.
 *
 * V07.05 Changes:
 * - Added agreement field to OrganizerRequest
 * - createOrganizerRequest now requires agreement parameter
 *
 * FILE LOCATION: services/firebase/organizerRequests.ts
 */

import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from '@firebase/firestore';
import { db } from './config';
import { promoteToOrganizer } from './users';
import type { OrganizerAgreement } from '../../types';

// ============================================
// TYPES
// ============================================

export type OrganizerRequestStatus = 'pending' | 'approved' | 'denied';

export interface OrganizerRequest {
  id: string;
  odUserId: string;
  userEmail: string;
  userName: string;
  userPhotoURL?: string;

  // Request details
  reason: string;
  experience?: string;
  associatedClub?: string;  // V07.05: Optional club/venue association

  // Agreement acceptance (V07.05)
  agreement: OrganizerAgreement;

  // Status
  status: OrganizerRequestStatus;

  // Admin response
  reviewedByUserId?: string;
  reviewedByName?: string;
  reviewedAt?: number;
  adminNotes?: string;
  denialReason?: string;

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

export interface CreateOrganizerRequestInput {
  odUserId: string;
  userEmail: string;
  userName: string;
  userPhotoURL?: string;
  reason: string;
  experience?: string;
  associatedClub?: string;  // V07.05: Optional club/venue
  agreement: OrganizerAgreement;  // V07.05: Required agreement
}

// ============================================
// COLLECTION
// ============================================

const COLLECTION = 'organizer_requests';

// ============================================
// CREATE REQUEST
// ============================================

/**
 * Create a new organizer request
 * Returns the request ID if successful
 * Throws if user already has a pending request
 */
export const createOrganizerRequest = async (
  input: CreateOrganizerRequestInput
): Promise<string> => {
  // Check for existing pending request
  const existing = await getOrganizerRequestByUserId(input.odUserId);
  if (existing && existing.status === 'pending') {
    throw new Error('You already have a pending request');
  }
  
  // If they were previously denied, allow new request
  // by using their odUserId as the doc ID (overwrites old request)
  const docRef = doc(db, COLLECTION, input.odUserId);
  
  const request: OrganizerRequest = {
    id: input.odUserId,
    odUserId: input.odUserId,
    userEmail: input.userEmail,
    userName: input.userName,
    userPhotoURL: input.userPhotoURL,
    reason: input.reason,
    experience: input.experience,
    associatedClub: input.associatedClub,
    agreement: input.agreement,  // V07.05: Store agreement acceptance
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  await setDoc(docRef, request);
  
  return request.id;
};

// ============================================
// READ REQUESTS
// ============================================

/**
 * Get a single request by ID
 */
export const getOrganizerRequest = async (
  requestId: string
): Promise<OrganizerRequest | null> => {
  const snap = await getDoc(doc(db, COLLECTION, requestId));
  return snap.exists() ? (snap.data() as OrganizerRequest) : null;
};

/**
 * Get request by user ID (since we use odUserId as doc ID)
 */
export const getOrganizerRequestByUserId = async (
  odUserId: string
): Promise<OrganizerRequest | null> => {
  return getOrganizerRequest(odUserId);
};

/**
 * Get all pending requests (for admin)
 */
export const getPendingOrganizerRequests = async (): Promise<OrganizerRequest[]> => {
  const q = query(
    collection(db, COLLECTION),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'asc')
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as OrganizerRequest);
};

/**
 * Get all requests (for admin history)
 */
export const getAllOrganizerRequests = async (): Promise<OrganizerRequest[]> => {
  const q = query(
    collection(db, COLLECTION),
    orderBy('createdAt', 'desc')
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as OrganizerRequest);
};

/**
 * Subscribe to pending requests (real-time for admin)
 */
export const subscribeToPendingOrganizerRequests = (
  callback: (requests: OrganizerRequest[]) => void
): (() => void) => {
  const q = query(
    collection(db, COLLECTION),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'asc')
  );
  
  return onSnapshot(q, (snap) => {
    const requests = snap.docs.map(d => d.data() as OrganizerRequest);
    callback(requests);
  });
};

/**
 * Subscribe to all requests (real-time for admin)
 */
export const subscribeToAllOrganizerRequests = (
  callback: (requests: OrganizerRequest[]) => void
): (() => void) => {
  const q = query(
    collection(db, COLLECTION),
    orderBy('updatedAt', 'desc')
  );
  
  return onSnapshot(q, (snap) => {
    const requests = snap.docs.map(d => d.data() as OrganizerRequest);
    callback(requests);
  });
};

// ============================================
// APPROVE / DENY REQUESTS
// ============================================

/**
 * Approve an organizer request
 * This also promotes the user to organizer role
 */
export const approveOrganizerRequest = async (
  requestId: string,
  adminUserId: string,
  adminName: string,
  adminNotes?: string
): Promise<void> => {
  const request = await getOrganizerRequest(requestId);
  if (!request) {
    throw new Error('Request not found');
  }
  
  if (request.status !== 'pending') {
    throw new Error('Request has already been processed');
  }
  
  // Update request status
  await updateDoc(doc(db, COLLECTION, requestId), {
    status: 'approved',
    reviewedByUserId: adminUserId,
    reviewedByName: adminName,
    reviewedAt: Date.now(),
    adminNotes: adminNotes || null,
    updatedAt: Date.now(),
  });
  
  // Promote user to organizer
  await promoteToOrganizer(request.odUserId);
};

/**
 * Deny an organizer request
 */
export const denyOrganizerRequest = async (
  requestId: string,
  adminUserId: string,
  adminName: string,
  denialReason?: string,
  adminNotes?: string
): Promise<void> => {
  const request = await getOrganizerRequest(requestId);
  if (!request) {
    throw new Error('Request not found');
  }
  
  if (request.status !== 'pending') {
    throw new Error('Request has already been processed');
  }
  
  // Update request status
  await updateDoc(doc(db, COLLECTION, requestId), {
    status: 'denied',
    reviewedByUserId: adminUserId,
    reviewedByName: adminName,
    reviewedAt: Date.now(),
    denialReason: denialReason || null,
    adminNotes: adminNotes || null,
    updatedAt: Date.now(),
  });
};

// ============================================
// DELETE REQUEST
// ============================================

/**
 * Delete a request (admin only, for cleanup)
 */
export const deleteOrganizerRequest = async (requestId: string): Promise<void> => {
  await deleteDoc(doc(db, COLLECTION, requestId));
};

// ============================================
// USER HELPERS
// ============================================

/**
 * Check if user has a pending request
 */
export const hasUserPendingRequest = async (odUserId: string): Promise<boolean> => {
  const request = await getOrganizerRequestByUserId(odUserId);
  return request?.status === 'pending';
};

/**
 * Get user's request status
 */
export const getUserRequestStatus = async (
  odUserId: string
): Promise<{ hasRequest: boolean; status?: OrganizerRequestStatus; denialReason?: string }> => {
  const request = await getOrganizerRequestByUserId(odUserId);
  
  if (!request) {
    return { hasRequest: false };
  }
  
  return {
    hasRequest: true,
    status: request.status,
    denialReason: request.denialReason,
  };
};