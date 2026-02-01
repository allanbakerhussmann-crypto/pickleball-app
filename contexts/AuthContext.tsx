
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { 
  type User, 
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  updateEmail,
  sendPasswordResetEmail
} from '@firebase/auth';

import { getAuth, createUserProfile, getUserProfile, updateUserProfileDoc } from '../services/firebase';
import type { UserProfile, UserRole } from '../types';
import { isAgreementCurrent } from '../constants/organizerAgreement';

// Consent data passed during signup
export interface SignupConsent {
  privacyPolicy: boolean;
  termsOfService: boolean;
  dataProcessing: boolean;
}

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signup: (email: string, pass: string, role: UserRole, name: string, consent: SignupConsent) => Promise<User | null>;
  login: (email: string, pass: string) => Promise<User | null>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  reloadUser: () => Promise<void>;
  updateUserProfile: (displayName: string) => Promise<void>;
  updateUserExtendedProfile: (data: Partial<UserProfile>) => Promise<void>;
  updateUserEmail: (newEmail: string) => Promise<void>;
  isOrganizer: boolean;
  isAdmin: boolean;
  isAppAdmin: boolean;
  isOrganizerBlocked: boolean;  // V07.05: True if organizer needs to accept agreement
  refreshUserProfile: () => Promise<void>;  // V07.05: Force refresh user profile
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

useEffect(() => {
  const auth = getAuth();

  let unsubscribe: (() => void) | undefined;

  (async () => {
    try {
      // ✅ Persist login across reloads
      await setPersistence(auth, browserLocalPersistence);
    } catch (e) {
      // Some preview/iframe environments block localStorage; fall back to session
      console.warn('Local persistence failed, falling back to session persistence:', e);
      await setPersistence(auth, browserSessionPersistence);
    }

    unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        setCurrentUser(user);

        if (user) {
          // Fetch extended profile from Firestore
          const profile = await getUserProfile(user.uid);

          if (profile) {
            // Use the profile from the database (roles are managed server-side)
            setUserProfile(profile);
          } else {
            // New user without a profile - create a basic one
            // Admin roles should be assigned via Cloud Functions, not auto-promoted
            const newProfile: UserProfile = {
              id: user.uid,
              displayName: user.displayName || 'User',
              email: user.email || '',
              roles: ['player']
            };
            await createUserProfile(user.uid, newProfile);
            setUserProfile(newProfile);
          }
        } else {
          setUserProfile(null);
        }
      } catch (err) {
        console.error('Auth State Change Error:', err);
        // Fallback for UI if profile fetch fails
        if (user) {
          setUserProfile({
            id: user.uid,
            displayName: user.displayName || 'User',
            email: user.email || '',
            roles: ['player']
          });
        }
      } finally {
        setLoading(false);
      }
    });
  })();

  return () => {
    if (unsubscribe) unsubscribe();
  };
}, []);

  
  // Action code settings for email verification and password reset
  // This configures the continue URL where users land after clicking email links
  const getActionCodeSettings = () => ({
    url: window.location.origin + '/#/login',
    handleCodeInApp: false,
  });

  const signup = useCallback(async (email: string, pass: string, role: UserRole, name: string, consent: SignupConsent) => {
      const auth = getAuth();
      // 1. Create Auth User
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const user = userCredential.user;

      // 2. Determine Roles based on signup selection
      // Admin roles should be granted via Cloud Functions by existing admins
      const roles: UserRole[] = role === 'organizer' ? ['player', 'organizer'] : ['player'];

      // 3. Create Firestore Profile with consent tracking
      const now = Date.now();
      const newProfile: UserProfile = {
          id: user.uid,
          odUserId: user.uid,
          email: email,
          displayName: name,
          roles: roles,
          createdAt: now,
          updatedAt: now,
          // Store consent timestamps for Privacy Act 2020 compliance
          privacyPolicyConsentAt: consent.privacyPolicy ? now : undefined,
          termsOfServiceConsentAt: consent.termsOfService ? now : undefined,
          dataProcessingConsentAt: consent.dataProcessing ? now : undefined,
          consentPolicyVersion: '1.0',
      };
      await createUserProfile(user.uid, newProfile);

      // 4. Update Auth Profile (Display Name)
      await updateProfile(user, { displayName: name });

      // 5. Send Verification
      await sendEmailVerification(user, getActionCodeSettings());

      // 6. Update Local State
      setCurrentUser(user);
      setUserProfile(newProfile);

      return user;
  }, []);
  
  const login = useCallback(async (email: string, pass: string) => {
      const auth = getAuth();
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      return userCredential.user;
  }, []);

  const logout = useCallback(() => {
    const auth = getAuth();
    return signOut(auth);
  }, []);
    const resetPassword = useCallback(async (email: string) => {
    const auth = getAuth();
    const actionCodeSettings = getActionCodeSettings();
    await sendPasswordResetEmail(auth, email, actionCodeSettings);
  }, []);


  const resendVerificationEmail = useCallback(async () => {
    const auth = getAuth();
    if (auth.currentUser) {
      // Temporarily removed actionCodeSettings to test basic email sending
      await sendEmailVerification(auth.currentUser);
    } else {
      throw new Error("No user is currently signed in to resend verification email.");
    }
  }, []);

  const reloadUser = useCallback(async () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user) {
      await user.reload();
      setCurrentUser(Object.assign({}, user));
    }
  }, []);

  const updateUserProfile = useCallback(async (displayName: string) => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user) {
      await updateProfile(user, { displayName });
      // Also update Firestore
      await updateUserProfileDoc(user.uid, { displayName });
      
      setCurrentUser(Object.assign({}, user));
      setUserProfile(prev => prev ? ({ ...prev, displayName }) : null);
    } else {
      throw new Error("No user is signed in.");
    }
  }, []);

  const updateUserExtendedProfile = useCallback(async (data: Partial<UserProfile>) => {
      const auth = getAuth();
      const user = auth.currentUser;
      if (user) {
          await updateUserProfileDoc(user.uid, data);
          setUserProfile(prev => prev ? ({ ...prev, ...data }) : null);
      } else {
          throw new Error("No user is signed in.");
      }
  }, []);

  const updateUserEmail = useCallback(async (newEmail: string) => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user) {
      await updateEmail(user, newEmail);
      // Also update Firestore
      await updateUserProfileDoc(user.uid, { email: newEmail });

      await sendEmailVerification(user, getActionCodeSettings());
      setCurrentUser(Object.assign({}, user));
      setUserProfile(prev => prev ? ({ ...prev, email: newEmail }) : null);
    } else {
      throw new Error("No user is signed in.");
    }
  }, []);

  // Helpers
  // Root Admin implies full permissions
  // Check for both 'app_admin' (new) and 'admin' (legacy) role names
  const isAppAdmin = userProfile?.isRootAdmin === true ||
                     userProfile?.isAppAdmin === true ||
                     !!userProfile?.roles?.includes('app_admin') ||
                     !!userProfile?.roles?.includes('admin');
  const isOrganizer = isAppAdmin || !!userProfile?.roles?.includes('organizer');

  // V07.05: Check if organizer needs to accept agreement
  // Blocked if: is organizer AND (no agreement OR agreement not current)
  const isOrganizerBlocked = isOrganizer && !isAgreementCurrent(userProfile?.organizerAgreement);

  // V07.05: Force refresh user profile (for after agreement acceptance)
  const refreshUserProfile = useCallback(async () => {
    if (currentUser) {
      const profile = await getUserProfile(currentUser.uid);
      if (profile) {
        setUserProfile(profile);
      }
    }
  }, [currentUser]);

  const value = {
    currentUser,
    userProfile,
    loading,
    signup,
    login,
    logout,
    resetPassword,
    resendVerificationEmail,
    reloadUser,
    updateUserProfile,
    updateUserExtendedProfile,
    updateUserEmail,
    isOrganizer,
    isAdmin: isAppAdmin,
    isAppAdmin,
    isOrganizerBlocked,
    refreshUserProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
