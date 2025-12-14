
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { 
  type User, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  updateEmail,
  sendPasswordResetEmail
} from 'firebase/auth';
import { getAuth, createUserProfile, getUserProfile, updateUserProfileDoc } from '../services/firebase';
import type { UserProfile, UserRole } from '../types';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signup: (email: string, pass: string, role: UserRole, name: string) => Promise<User | null>;
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
    if (!auth) {
        setLoading(false);
        return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        // Fetch extended profile from Firestore
        let profile = await getUserProfile(user.uid);
        
        // Auto-promote specific admin email
        const ADMIN_EMAIL = 'allanrbaker13@gmail.com';
        if (user.email === ADMIN_EMAIL) {
            const currentRoles = profile?.roles || ['player'];
            const hasAdminRole = currentRoles.includes('admin');
            
            if (!hasAdminRole) {
                // Grant all roles
                const newRoles: UserRole[] = Array.from(new Set([...currentRoles, 'player', 'organizer', 'admin'])) as UserRole[];
                
                const updatedProfileData = {
                    id: user.uid,
                    email: user.email || '',
                    displayName: profile?.displayName || user.displayName || 'Admin',
                    roles: newRoles,
                    isRootAdmin: true // Ensure flag is set for hardcoded email
                };
                
                // Update DB
                await createUserProfile(user.uid, updatedProfileData);
                
                // Update local variable so state is correct immediately
                if (profile) {
                    profile.roles = newRoles;
                    profile.isRootAdmin = true;
                } else {
                    profile = updatedProfileData as UserProfile;
                }
            }
        }

        if (profile) {
            setUserProfile(profile);
        } else {
            // Legacy user or error: fallback
             setUserProfile({
                id: user.uid,
                displayName: user.displayName || 'User',
                email: user.email || '',
                roles: user.email === ADMIN_EMAIL ? ['player', 'organizer', 'admin'] : ['player'],
                isRootAdmin: user.email === ADMIN_EMAIL
             });
        }
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });
    return unsubscribe;
  }, []);
  
  // Helper to improve email link clickability on mobile (especially iOS)
  // FIXED: Removed URL to prevent "Domain not allowlisted" error during development.
  const getActionCodeSettings = () => undefined;

  const signup = useCallback(async (email: string, pass: string, role: UserRole, name: string) => {
      const auth = getAuth();
      if (!auth) throw new Error("Auth not initialized");
      // 1. Create Auth User
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const user = userCredential.user;

      // 2. Determine Roles
      const ADMIN_EMAIL = 'allanrbaker13@gmail.com';
      let roles: UserRole[] = role === 'organizer' ? ['player', 'organizer'] : ['player'];
      let isRoot = false;

      // Force admin roles for specific email
      if (email === ADMIN_EMAIL) {
          roles = ['player', 'organizer', 'admin'];
          isRoot = true;
      }

      // 3. Create Firestore Profile
      const newProfile: UserProfile = {
          id: user.uid,
          email: email, 
          displayName: name,
          roles: roles,
          isRootAdmin: isRoot
      };
      await createUserProfile(user.uid, newProfile);

      // 4. Update Auth Profile (Display Name)
      await updateProfile(user, { displayName: name });

      // 5. Send Verification
      // Passing settings helps ensure the link is formatted correctly for mobile devices
      await sendEmailVerification(user, getActionCodeSettings());

      // 6. Update Local State
      setCurrentUser(user);
      setUserProfile(newProfile);

      return user;
  }, []);
  
  const login = useCallback(async (email: string, pass: string) => {
      const auth = getAuth();
      if (!auth) throw new Error("Auth not initialized");
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      return userCredential.user;
  }, []);

  const logout = useCallback(() => {
    const auth = getAuth();
    if (!auth) return Promise.resolve();
    return signOut(auth);
  }, []);
    const resetPassword = useCallback(async (email: string) => {
    const auth = getAuth();
    if (!auth) throw new Error("Auth not initialized");
    // Optionally use the same action code settings as verification;
    // this helps with handling on mobile.
    const actionCodeSettings = getActionCodeSettings();
    await sendPasswordResetEmail(auth, email, actionCodeSettings);
  }, []);


  const resendVerificationEmail = useCallback(async () => {
    const auth = getAuth();
    if (auth && auth.currentUser) {
      await sendEmailVerification(auth.currentUser, getActionCodeSettings());
    } else {
      throw new Error("No user is currently signed in to resend verification email.");
    }
  }, []);

  const reloadUser = useCallback(async () => {
    const auth = getAuth();
    const user = auth?.currentUser;
    if (user) {
      await user.reload();
      setCurrentUser(Object.assign({}, user));
    }
  }, []);

  const updateUserProfile = useCallback(async (displayName: string) => {
    const auth = getAuth();
    const user = auth?.currentUser;
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
      const user = auth?.currentUser;
      if (user) {
          await updateUserProfileDoc(user.uid, data);
          setUserProfile(prev => prev ? ({ ...prev, ...data }) : null);
      } else {
          throw new Error("No user is signed in.");
      }
  }, []);

  const updateUserEmail = useCallback(async (newEmail: string) => {
    const auth = getAuth();
    const user = auth?.currentUser;
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
  const isAppAdmin = userProfile?.isRootAdmin === true || !!userProfile?.roles?.includes('admin');
  const isOrganizer = isAppAdmin || !!userProfile?.roles?.includes('organizer');

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
    isAppAdmin
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
