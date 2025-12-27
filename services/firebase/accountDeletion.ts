/**
 * Account Deletion Service
 *
 * Handles user account deletion and data cleanup for Privacy Act 2020 compliance.
 * Cascade deletes user data across all collections.
 *
 * FILE LOCATION: services/firebase/accountDeletion.ts
 * VERSION: V06.04
 */

import {
  doc,
  getDocs,
  collection,
  query,
  where,
  writeBatch,
} from '@firebase/firestore';
import { deleteUser } from '@firebase/auth';
import { ref, deleteObject, listAll } from '@firebase/storage';
import { db, storage, getAuth } from './config';

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
 * Delete all user data from Firestore and Storage
 * This should be called before deleting the Firebase Auth user
 */
export const deleteUserData = async (userId: string): Promise<DeletionResult> => {
  const result: DeletionResult = {
    success: false,
    message: '',
    deletedData: {
      profile: false,
      registrations: 0,
      leagueMemberships: 0,
      meetupRsvps: 0,
      courtBookings: 0,
      profileImage: false,
    },
  };

  try {
    const batch = writeBatch(db);

    // 1. Delete user profile
    const userRef = doc(db, 'users', userId);
    batch.delete(userRef);
    result.deletedData!.profile = true;

    // 2. Delete tournament registrations
    const registrationsSnap = await getDocs(
      query(collection(db, 'registrations'), where('userId', '==', userId))
    );
    registrationsSnap.docs.forEach((d) => {
      batch.delete(d.ref);
      result.deletedData!.registrations++;
    });

    // 3. Delete league memberships (across all leagues)
    // Note: This queries the top-level structure. League members in subcollections
    // would need per-league queries which is expensive. Consider Cloud Function.
    const leaguesSnap = await getDocs(collection(db, 'leagues'));
    for (const leagueDoc of leaguesSnap.docs) {
      const membersSnap = await getDocs(
        query(
          collection(db, 'leagues', leagueDoc.id, 'members'),
          where('userId', '==', userId)
        )
      );
      membersSnap.docs.forEach((d) => {
        batch.delete(d.ref);
        result.deletedData!.leagueMemberships++;
      });
    }

    // 4. Delete meetup RSVPs
    const meetupsSnap = await getDocs(collection(db, 'meetups'));
    for (const meetupDoc of meetupsSnap.docs) {
      const rsvpsSnap = await getDocs(
        query(
          collection(db, 'meetups', meetupDoc.id, 'rsvps'),
          where('userId', '==', userId)
        )
      );
      rsvpsSnap.docs.forEach((d) => {
        batch.delete(d.ref);
        result.deletedData!.meetupRsvps++;
      });
    }

    // 5. Delete court bookings
    const bookingsSnap = await getDocs(
      query(collection(db, 'courtBookings'), where('userId', '==', userId))
    );
    bookingsSnap.docs.forEach((d) => {
      batch.delete(d.ref);
      result.deletedData!.courtBookings++;
    });

    // Commit all Firestore deletions
    await batch.commit();

    // 6. Delete profile image from Storage
    try {
      const profileImagesRef = ref(storage, `profile_images`);
      const imagesList = await listAll(profileImagesRef);

      for (const item of imagesList.items) {
        if (item.name.startsWith(userId)) {
          await deleteObject(item);
          result.deletedData!.profileImage = true;
        }
      }
    } catch (storageError) {
      // Storage deletion is non-critical, continue even if it fails
      console.warn('Could not delete profile image:', storageError);
    }

    result.success = true;
    result.message = 'User data deleted successfully';
    return result;

  } catch (error: any) {
    console.error('Error deleting user data:', error);
    result.message = error.message || 'Failed to delete user data';
    return result;
  }
};

/**
 * Complete account deletion - deletes data and Firebase Auth account
 * User must be recently authenticated for this to work
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

  // First delete all user data
  const dataResult = await deleteUserData(user.uid);

  if (!dataResult.success) {
    return dataResult;
  }

  // Then delete the Firebase Auth account
  try {
    await deleteUser(user);
    return {
      ...dataResult,
      message: 'Account and all data deleted successfully',
    };
  } catch (error: any) {
    // If deletion fails due to auth, data is already gone
    // User may need to re-authenticate
    if (error.code === 'auth/requires-recent-login') {
      return {
        success: false,
        message: 'Please log out and log back in, then try again. This is required for security.',
        deletedData: dataResult.deletedData,
      };
    }

    return {
      success: false,
      message: error.message || 'Failed to delete account',
      deletedData: dataResult.deletedData,
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
    exportData.registrations = registrationsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    // Get court bookings
    const bookingsSnap = await getDocs(
      query(collection(db, 'courtBookings'), where('userId', '==', userId))
    );
    exportData.courtBookings = bookingsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return exportData;
  } catch (error) {
    console.error('Error exporting user data:', error);
    throw error;
  }
};
