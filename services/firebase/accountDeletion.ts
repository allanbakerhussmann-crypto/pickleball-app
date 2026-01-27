/**
 * Account Deletion Service
 *
 * Handles user account deletion and data cleanup for Privacy Act 2020 compliance.
 * Uses Cloud Function for secure server-side deletion with admin privileges.
 *
 * FILE LOCATION: services/firebase/accountDeletion.ts
 * VERSION: V07.53
 */

import { httpsCallable } from '@firebase/functions';
import { getDocs, collection, query, where, DocumentData } from '@firebase/firestore';
import { functions, getAuth, db } from './config';

export interface DeletionResult {
  success: boolean;
  message: string;
  deletedData?: {
    profile: boolean;
    registrations: number;
    leagueMemberships: number;
    meetupRsvps: number;
    courtBookings: number;
    profileImage: boolean;
  };
}

/**
 * Complete account deletion - calls Cloud Function to delete data and Firebase Auth account
 *
 * The Cloud Function handles:
 * 1. Deleting the user's Firestore profile document
 * 2. Deleting tournament registrations
 * 3. Deleting league memberships (subcollections)
 * 4. Deleting meetup RSVPs (subcollections)
 * 5. Deleting court bookings
 * 6. Deleting profile images from Storage
 * 7. Deleting the Firebase Auth account
 */
export const deleteAccount = async (): Promise<DeletionResult> => {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    return {
      success: false,
      message: 'No user is currently logged in',
    };
  }

  try {
    const deleteAccountFn = httpsCallable<Record<string, never>, DeletionResult>(
      functions,
      'user_deleteAccount'
    );

    const response = await deleteAccountFn({});
    return response.data;
  } catch (error: any) {
    console.error('Error deleting account:', error);

    // Handle specific Firebase errors
    if (error.code === 'functions/unauthenticated') {
      return {
        success: false,
        message: 'Please log out and log back in, then try again. This is required for security.',
      };
    }

    if (error.code === 'functions/not-found') {
      return {
        success: false,
        message: 'User profile not found.',
      };
    }

    return {
      success: false,
      message: error.message || 'Failed to delete account. Please contact support.',
    };
  }
};

/**
 * Export user data for data portability (GDPR/Privacy Act compliance)
 */
export const exportUserData = async (userId: string): Promise<object> => {
  const exportData: Record<string, any> = {
    exportedAt: new Date().toISOString(),
    userId,
  };

  try {
    // Get user profile
    const userDoc = await getDocs(
      query(collection(db, 'users'), where('__name__', '==', userId))
    );
    if (!userDoc.empty) {
      const profile = userDoc.docs[0].data();
      // Remove sensitive tokens
      delete profile.duprAccessToken;
      delete profile.duprRefreshToken;
      exportData.profile = profile;
    }

    // Get registrations
    const registrationsSnap = await getDocs(
      query(collection(db, 'registrations'), where('userId', '==', userId))
    );
    exportData.registrations = registrationsSnap.docs.map((d: { id: string; data: () => DocumentData }) => ({
      id: d.id,
      ...d.data(),
    }));

    // Get court bookings
    const bookingsSnap = await getDocs(
      query(collection(db, 'courtBookings'), where('userId', '==', userId))
    );
    exportData.courtBookings = bookingsSnap.docs.map((d: { id: string; data: () => DocumentData }) => ({
      id: d.id,
      ...d.data(),
    }));

    return exportData;
  } catch (error) {
    console.error('Error exporting user data:', error);
    throw error;
  }
};
