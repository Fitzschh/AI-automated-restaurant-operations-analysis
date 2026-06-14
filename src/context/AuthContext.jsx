import React, { createContext, useContext, useState, useCallback } from 'react';
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail, setPersistence, browserLocalPersistence, updatePassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { loadUserNickname, saveUserNickname } from '../lib/menuApi';

const AuthContext = createContext(null);

const AUTH_KEY = 'e-menu-user';
const AI_BRIEFING_PENDING_KEY = 'ai_daily_briefing_pending';
const AI_BRIEFING_PENDING_AT_KEY = 'ai_daily_briefing_pending_at';
const AI_AUTH_SESSION_UID_KEY = 'ai_auth_session_uid';

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
  const [nicknameLoaded, setNicknameLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);

  React.useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setNicknameLoaded(false);
          setNickname('');
          const userData = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
          };
          setUser(userData);
          localStorage.setItem(AUTH_KEY, JSON.stringify(userData));

          const activeSessionUid = sessionStorage.getItem(AI_AUTH_SESSION_UID_KEY);
          if (activeSessionUid !== firebaseUser.uid && sessionStorage.getItem(AI_BRIEFING_PENDING_KEY) !== '1') {
            sessionStorage.setItem(AI_BRIEFING_PENDING_KEY, '1');
            sessionStorage.setItem(AI_BRIEFING_PENDING_AT_KEY, String(Date.now()));
          }
          sessionStorage.setItem(AI_AUTH_SESSION_UID_KEY, firebaseUser.uid);

          const userNickname = await loadUserNickname(firebaseUser.uid);
          setNickname(userNickname || '');
          setNicknameLoaded(true);

          console.log("User is logged in:", firebaseUser.email);
        } else {
          setUser(null);
          setNickname('');
          setNicknameLoaded(false);
          localStorage.removeItem(AUTH_KEY);
          sessionStorage.removeItem(AI_AUTH_SESSION_UID_KEY);
          sessionStorage.removeItem(AI_BRIEFING_PENDING_KEY);
          sessionStorage.removeItem(AI_BRIEFING_PENDING_AT_KEY);
          console.log("User not logged in");
        }
      } catch (err) {
        console.error('Auth state change error:', err);
        setNicknameLoaded(true);
      } finally {
        setInitialLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    sessionStorage.setItem(AI_BRIEFING_PENDING_KEY, '1');
    sessionStorage.setItem(AI_BRIEFING_PENDING_AT_KEY, String(Date.now()));
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return true;
    } catch (err) {
      sessionStorage.removeItem(AI_BRIEFING_PENDING_KEY);
      sessionStorage.removeItem(AI_BRIEFING_PENDING_AT_KEY);
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
      sessionStorage.removeItem(AI_AUTH_SESSION_UID_KEY);
      sessionStorage.removeItem(AI_BRIEFING_PENDING_KEY);
      sessionStorage.removeItem(AI_BRIEFING_PENDING_AT_KEY);
      await signOut(auth);
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
      nicknameLoaded,
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
