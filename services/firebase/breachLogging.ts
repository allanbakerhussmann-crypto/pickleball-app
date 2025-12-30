/**
 * Breach Logging Service - Privacy Act 2020 Compliance
 *
 * Logs security incidents and privacy breaches for compliance.
 * Under the Privacy Act 2020, notifiable breaches must be reported
 * to the Privacy Commissioner if they cause/are likely to cause
 * serious harm to affected individuals.
 *
 * FILE LOCATION: services/firebase/breachLogging.ts
 * VERSION: V06.04
 */

import {
  doc,
  setDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  updateDoc,
} from '@firebase/firestore';
import { db } from './config';

// ============================================
// TYPES
// ============================================

export type BreachSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BreachStatus = 'detected' | 'investigating' | 'contained' | 'resolved' | 'reported';
export type BreachCategory =
  | 'unauthorized_access'
  | 'data_disclosure'
  | 'data_loss'
  | 'system_compromise'
  | 'phishing'
  | 'malware'
  | 'insider_threat'
  | 'other';

export interface BreachRecord {
  id: string;
  // What happened
  category: BreachCategory;
  severity: BreachSeverity;
  title: string;
  description: string;

  // Who is affected
  affectedUserIds?: string[];
  estimatedAffectedCount?: number;
  dataTypesExposed?: string[]; // e.g., ['email', 'phone', 'dupr_rating']

  // Timeline
  detectedAt: number;
  occurredAt?: number; // When breach actually occurred (if known)
  containedAt?: number;
  resolvedAt?: number;
  reportedToCommissionerAt?: number;

  // Status and response
  status: BreachStatus;
  requiresNotification: boolean; // Does this require notifying Privacy Commissioner?
  usersNotified: boolean;

  // Response actions
  actionsToken: string[];
  remediation?: string;

  // Audit trail
  loggedBy: string; // User ID who logged the breach
  updatedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface LogBreachInput {
  category: BreachCategory;
  severity: BreachSeverity;
  title: string;
  description: string;
  affectedUserIds?: string[];
  estimatedAffectedCount?: number;
  dataTypesExposed?: string[];
  occurredAt?: number;
  requiresNotification?: boolean;
}

// ============================================
// BREACH LOGGING FUNCTIONS
// ============================================

/**
 * Generate a unique breach ID
 */
const generateBreachId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `BREACH-${timestamp}-${random}`.toUpperCase();
};

/**
 * Log a new security breach
 * Should be called by admins when a breach is detected
 */
export const logBreach = async (
  input: LogBreachInput,
  loggedByUserId: string
): Promise<BreachRecord> => {
  const breachId = generateBreachId();
  const now = Date.now();

  // Determine if notification is required based on severity and data exposed
  const requiresNotification = input.requiresNotification ??
    ((input.severity === 'critical' || input.severity === 'high') &&
    (input.dataTypesExposed?.length ?? 0) > 0);

  const breachRecord: BreachRecord = {
    id: breachId,
    category: input.category,
    severity: input.severity,
    title: input.title,
    description: input.description,
    affectedUserIds: input.affectedUserIds || [],
    estimatedAffectedCount: input.estimatedAffectedCount || input.affectedUserIds?.length || 0,
    dataTypesExposed: input.dataTypesExposed || [],
    detectedAt: now,
    occurredAt: input.occurredAt,
    status: 'detected',
    requiresNotification,
    usersNotified: false,
    actionsToken: ['Breach detected and logged'],
    loggedBy: loggedByUserId,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'security_breaches', breachId), breachRecord);

  return breachRecord;
};

/**
 * Update breach status
 */
export const updateBreachStatus = async (
  breachId: string,
  status: BreachStatus,
  updatedByUserId: string,
  additionalData?: Partial<BreachRecord>
): Promise<void> => {
  const now = Date.now();
  const updateData: Partial<BreachRecord> = {
    status,
    updatedBy: updatedByUserId,
    updatedAt: now,
    ...additionalData,
  };

  // Set timestamp based on status
  if (status === 'contained' && !additionalData?.containedAt) {
    updateData.containedAt = now;
  }
  if (status === 'resolved' && !additionalData?.resolvedAt) {
    updateData.resolvedAt = now;
  }
  if (status === 'reported' && !additionalData?.reportedToCommissionerAt) {
    updateData.reportedToCommissionerAt = now;
  }

  await updateDoc(doc(db, 'security_breaches', breachId), updateData);
};

/**
 * Add an action to the breach timeline
 */
export const addBreachAction = async (
  breachId: string,
  action: string,
  updatedByUserId: string
): Promise<void> => {
  const breachRef = doc(db, 'security_breaches', breachId);
  const timestamp = new Date().toISOString();

  await updateDoc(breachRef, {
    actionsToken: [...(await getBreachById(breachId))?.actionsToken || [], `[${timestamp}] ${action}`],
    updatedBy: updatedByUserId,
    updatedAt: Date.now(),
  });
};

/**
 * Mark users as notified about a breach
 */
export const markUsersNotified = async (
  breachId: string,
  updatedByUserId: string
): Promise<void> => {
  await updateDoc(doc(db, 'security_breaches', breachId), {
    usersNotified: true,
    updatedBy: updatedByUserId,
    updatedAt: Date.now(),
  });
};

/**
 * Get breach by ID
 */
export const getBreachById = async (breachId: string): Promise<BreachRecord | null> => {
  const breachRef = doc(db, 'security_breaches', breachId);
  const { getDoc } = await import('@firebase/firestore');
  const breachDoc = await getDoc(breachRef);

  if (!breachDoc.exists()) return null;
  return breachDoc.data() as BreachRecord;
};

/**
 * Get all breaches (for admin dashboard)
 */
export const getAllBreaches = async (
  limitCount: number = 50,
  statusFilter?: BreachStatus
): Promise<BreachRecord[]> => {
  let q = query(
    collection(db, 'security_breaches'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  if (statusFilter) {
    q = query(
      collection(db, 'security_breaches'),
      where('status', '==', statusFilter),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as BreachRecord);
};

/**
 * Get breaches requiring Privacy Commissioner notification
 */
export const getNotifiableBreaches = async (): Promise<BreachRecord[]> => {
  const q = query(
    collection(db, 'security_breaches'),
    where('requiresNotification', '==', true),
    where('status', '!=', 'reported'),
    orderBy('status'),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as BreachRecord);
};

/**
 * Get breaches affecting a specific user
 */
export const getBreachesAffectingUser = async (userId: string): Promise<BreachRecord[]> => {
  const q = query(
    collection(db, 'security_breaches'),
    where('affectedUserIds', 'array-contains', userId),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as BreachRecord);
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Determine if a breach requires notification to Privacy Commissioner
 * Based on Privacy Act 2020 guidelines
 */
export const assessNotificationRequirement = (
  severity: BreachSeverity,
  dataTypesExposed: string[],
  estimatedAffectedCount: number
): { required: boolean; reason: string } => {
  // Critical severity always requires notification
  if (severity === 'critical') {
    return {
      required: true,
      reason: 'Critical severity breach - immediate notification required',
    };
  }

  // Sensitive data exposure requires notification
  const sensitiveDataTypes = ['payment', 'financial', 'health', 'password', 'identity'];
  const hasSensitiveData = dataTypesExposed.some(type =>
    sensitiveDataTypes.some(sensitive => type.toLowerCase().includes(sensitive))
  );

  if (hasSensitiveData) {
    return {
      required: true,
      reason: 'Sensitive personal information exposed',
    };
  }

  // Large scale breaches require notification
  if (estimatedAffectedCount > 100) {
    return {
      required: true,
      reason: `Large-scale breach affecting ${estimatedAffectedCount}+ users`,
    };
  }

  // High severity with personal data requires notification
  if (severity === 'high' && dataTypesExposed.length > 0) {
    return {
      required: true,
      reason: 'High severity breach with personal data exposure',
    };
  }

  return {
    required: false,
    reason: 'Breach does not meet notification threshold',
  };
};

/**
 * Format breach for Privacy Commissioner report
 */
export const formatBreachForReport = (breach: BreachRecord): string => {
  return `
PRIVACY BREACH NOTIFICATION
===========================

Breach ID: ${breach.id}
Date Detected: ${new Date(breach.detectedAt).toISOString()}
${breach.occurredAt ? `Date Occurred: ${new Date(breach.occurredAt).toISOString()}` : ''}

NATURE OF BREACH
----------------
Category: ${breach.category}
Severity: ${breach.severity}
Title: ${breach.title}
Description: ${breach.description}

AFFECTED INDIVIDUALS
--------------------
Estimated Count: ${breach.estimatedAffectedCount}
Data Types Exposed: ${breach.dataTypesExposed?.join(', ') || 'None specified'}

ACTIONS TAKEN
-------------
${breach.actionsToken.join('\n')}

STATUS
------
Current Status: ${breach.status}
Users Notified: ${breach.usersNotified ? 'Yes' : 'No'}

REMEDIATION
-----------
${breach.remediation || 'To be determined'}

---
Report generated: ${new Date().toISOString()}
Organisation: Pickleball Director
Contact: support@pickleballdirector.co.nz
  `.trim();
};
