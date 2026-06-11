import React, { createContext, useContext, useState, useCallback } from 'react';
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail, setPersistence, browserLocalPersistence, updatePassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { loadUserNickname, saveUserNickname } from '../lib/menuApi';

const AuthContext = createContext(null);

const AUTH_KEY = 'e-menu-user';

// Initialize persistence - keep user logged in after refresh
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("Persistence set to LOCAL");
  })
  .catch((error) => {
    console.error('Failed to set persistence:', error);
  });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);

  // Use Firebase onAuthStateChanged for secure session management
  React.useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userData = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
          };
          setUser(userData);
          localStorage.setItem(AUTH_KEY, JSON.stringify(userData));

          // Load user nickname using UID
          const userNickname = await loadUserNickname(firebaseUser.uid);
          setNickname(userNickname);

          console.log("User is logged in:", firebaseUser.email);
        } else {
          setUser(null);
          setNickname('');
          localStorage.removeItem(AUTH_KEY);
          console.log("User not logged in");
        }
      } catch (err) {
        console.error('Auth state change error:', err);
      } finally {
        setInitialLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // setUser and localStorage will be handled by onAuthStateChanged
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateNickname = useCallback(async (newNickname) => {
    if (!user?.uid) return;
    try {
      await saveUserNickname(user.uid, user.email, newNickname);
      setNickname(newNickname);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [user]);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await signOut(auth);
      // setUser and localStorage will be handled by onAuthStateChanged
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const forgotPassword = useCallback(async (email) => {
    setLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Change password for the currently signed-in user.
   * Requires recent authentication. If it fails with 'requires-recent-login',
   * the caller should prompt the user to re-authenticate.
   * TODO: Wire up re-authentication flow if needed.
   */
  const changePassword = useCallback(async (newPassword) => {
    if (!auth.currentUser) {
      setError('No user is currently signed in');
      return false;
    }
    setLoading(true);
    setError(null);
    try {
      await updatePassword(auth.currentUser, newPassword);
      return true;
    } catch (err) {
      if (err.code === 'auth/requires-recent-login') {
        setError('Please log out and log back in, then try changing your password again.');
      } else {
        setError(err.message);
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      nickname,
      updateNickname,
      changePassword,
      login,
      logout,
      forgotPassword,
      isAuthenticated: !!user,
      loading,
      initialLoading,
      error
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
