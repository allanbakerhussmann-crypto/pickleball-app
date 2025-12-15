/**
 * Audit Logging
 */

import { 
  doc, 
  setDoc,
  collection, 
} from '@firebase/firestore';
import { db } from './config';

// ============================================
// Audit Logging
// ============================================

export const logAudit = async (
  action: string,
  userId: string,
  details: Record<string, any>
) => {
  const auditRef = doc(collection(db, 'audit_logs'));
  await setDoc(auditRef, {
    id: auditRef.id,
    action,
    userId,
    details,
    timestamp: Date.now(),
    createdAt: new Date().toISOString()
  });
};