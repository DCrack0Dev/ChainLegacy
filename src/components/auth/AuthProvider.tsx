'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, onIdTokenChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Loading } from '@/components/ui/Loading';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

function setSessionCookie(token: string | null) {
  if (typeof document === 'undefined') return;
  if (token) {
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `__session=${token}; path=/; SameSite=Lax${secure}; max-age=3600`;
  } else {
    document.cookie = '__session=; path=/; SameSite=Lax; max-age=0';
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      console.error('AuthProvider: Firebase Auth not initialized. Check your NEXT_PUBLIC_FIREBASE_API_KEY.');
      setLoading(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.error('AuthProvider: Auth check timed out. Firebase might be blocked or credentials invalid.');
        }
        return false;
      });
    }, 5000);

    const unsubAuth = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
      clearTimeout(timeoutId);
      if (!nextUser) setSessionCookie(null);
    });

    const unsubToken = onIdTokenChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setSessionCookie(null);
        return;
      }
      try {
        const token = await nextUser.getIdToken();
        setSessionCookie(token);
      } catch {
        setSessionCookie(null);
      }
    });

    return () => {
      unsubAuth();
      unsubToken();
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
