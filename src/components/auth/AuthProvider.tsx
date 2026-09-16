'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("AuthProvider: Initializing...");
    if (!auth) {
      console.error("AuthProvider: Firebase Auth not initialized. Check your NEXT_PUBLIC_FIREBASE_API_KEY.");
      setLoading(false);
      return;
    }
    
    // Set a timeout to prevent infinite loading if Firebase hangs
    const timeoutId = setTimeout(() => {
      if (loading) {
        console.error("AuthProvider: Auth check timed out. Firebase might be blocked or credentials invalid.");
        setLoading(false);
      }
    }, 5000);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log("AuthProvider: Auth state changed", user ? "User logged in" : "No user");
      setUser(user);
      setLoading(false);
      clearTimeout(timeoutId);
    });

    return () => {
      unsubscribe();
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
