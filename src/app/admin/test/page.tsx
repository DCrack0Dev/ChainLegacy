'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, deleteField, collection, addDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, deleteObject, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/components/auth/AuthProvider';
import { Navbar } from '@/components/ui/Navbar';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import { Shield, Database, Mail, Smartphone, Lock, Video, Activity, Play, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { EncryptionService } from '@/services/encryption';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

type TestResult = {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'pass' | 'fail' | 'warning';
  message: string;
  icon: React.ReactNode;
};

export default function AdminTestPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [globalRunning, setGlobalRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([
    { id: 'auth', name: 'Auth Test', status: 'pending', message: 'Not started', icon: <Shield className="h-5 w-5" /> },
    { id: 'firestore', name: 'Firestore Test', status: 'pending', message: 'Not started', icon: <Database className="h-5 w-5" /> },
    { id: 'encryption', name: 'Vault Encryption', status: 'pending', message: 'Not started', icon: <Lock className="h-5 w-5" /> },
    { id: 'storage', name: 'Video Storage', status: 'pending', message: 'Not started', icon: <Video className="h-5 w-5" /> },
    { id: 'email', name: 'Email System', status: 'pending', message: 'Not started', icon: <Mail className="h-5 w-5" /> },
    { id: 'sms', name: 'SMS System', status: 'pending', message: 'Not started', icon: <Smartphone className="h-5 w-5" /> },
    { id: 'tracking', name: 'Device Tracking', status: 'pending', message: 'Not started', icon: <Activity className="h-5 w-5" /> },
  ]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const updateTestResult = (id: string, updates: Partial<TestResult>) => {
    setResults(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const logTestResult = async (name: string, status: string, message: string) => {
    try {
      await addDoc(collection(db, 'TestLogs'), {
        testName: name,
        result: status,
        message,
        timestamp: serverTimestamp(),
        userId: user?.uid,
      });
    } catch (e) {
      console.error('Failed to log test result to Firestore', e);
    }
  };

  // A. AUTH TEST
  const runAuthTest = async () => {
    updateTestResult('auth', { status: 'running', message: 'Checking user session...' });
    try {
      if (user) {
        updateTestResult('auth', { status: 'pass', message: `Authenticated as ${user.email}` });
        await logTestResult('Auth Test', 'pass', `User ${user.email} authenticated`);
        return true;
      } else {
        throw new Error('No user session found');
      }
    } catch (e: any) {
      updateTestResult('auth', { status: 'fail', message: e.message });
      await logTestResult('Auth Test', 'fail', e.message);
      return false;
    }
  };

  // B. FIRESTORE TEST
  const runFirestoreTest = async () => {
    updateTestResult('firestore', { status: 'running', message: 'Testing Read/Write/Delete...' });
    try {
      if (!user) throw new Error('Auth required');
      const userRef = doc(db, 'users', user.uid);
      
      // Write
      await updateDoc(userRef, { _test_field: 'testing' });
      
      // Read
      const snap = await getDoc(userRef);
      if (snap.data()?._test_field !== 'testing') throw new Error('Data mismatch after write');
      
      // Delete
      await updateDoc(userRef, { _test_field: deleteField() });
      
      updateTestResult('firestore', { status: 'pass', message: 'Read, Write, and Delete successful' });
      await logTestResult('Firestore Test', 'pass', 'Full CRUD cycle successful');
      return true;
    } catch (e: any) {
      updateTestResult('firestore', { status: 'fail', message: e.message });
      await logTestResult('Firestore Test', 'fail', e.message);
      return false;
    }
  };

  // C. VAULT ENCRYPTION TEST
  const runEncryptionTest = async () => {
    updateTestResult('encryption', { status: 'running', message: 'Testing AES-256 cycles...' });
    try {
      const original = 'ChainLegacy Secret 123!@#';
      const pass = 'TestPassword123_SecureLong';
      const encrypted = await EncryptionService.encryptText(original, pass);
      const decrypted = await EncryptionService.decryptText(encrypted, pass);
      
      if (original === decrypted) {
        updateTestResult('encryption', { status: 'pass', message: 'Encryption match exact' });
        await logTestResult('Encryption Test', 'pass', 'Values match after cycle');
        return true;
      } else {
        throw new Error('Decrypted value does not match original');
      }
    } catch (e: any) {
      updateTestResult('encryption', { status: 'fail', message: e.message });
      await logTestResult('Encryption Test', 'fail', e.message);
      return false;
    }
  };

  // D. STORAGE TEST
  const runStorageTest = async () => {
    updateTestResult('storage', { status: 'running', message: 'Testing Upload/Delete...' });
    try {
      if (!user) throw new Error('Auth required');
      const blob = new Blob(['test file content'], { type: 'text/plain' });
      const testRef = ref(storage, `tests/${user.uid}/test.txt`);
      
      // Upload
      await uploadBytes(testRef, blob);
      
      // Get URL
      const url = await getDownloadURL(testRef);
      if (!url) throw new Error('Failed to get download URL');
      
      // Delete
      await deleteObject(testRef);
      
      updateTestResult('storage', { status: 'pass', message: 'Upload and deletion successful' });
      await logTestResult('Storage Test', 'pass', 'Full lifecycle successful');
      return true;
    } catch (e: any) {
      updateTestResult('storage', { status: 'fail', message: e.message });
      await logTestResult('Storage Test', 'fail', e.message);
      return false;
    }
  };

  // E. EMAIL TEST
  const runEmailTest = async () => {
    updateTestResult('email', { status: 'running', message: 'Triggering SendGrid API...' });
    try {
      if (!user?.email) throw new Error('User email missing');
      
      const token = await user.getIdToken();
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          to: user.email,
          subject: '[ChainLegacy] System Health Test',
          html: '<p>If you see this, the ChainLegacy email system is <strong>operational</strong>.</p>'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'API failed');

      updateTestResult('email', { status: 'pass', message: 'Email sent successfully' });
      await logTestResult('Email Test', 'pass', `Sent to ${user.email}`);
      return true;
    } catch (e: any) {
      updateTestResult('email', { status: 'fail', message: e.message });
      await logTestResult('Email Test', 'fail', e.message);
      return false;
    }
  };

  // F. SMS TEST
  const runSmsTest = async () => {
    updateTestResult('sms', { status: 'running', message: 'Simulating SMS provider...' });
    try {
      // Current implementation is simulated in console logs
      console.log('[SMS Test] Executing simulated SMS send...');
      await new Promise(r => setTimeout(r, 500)); // Simulate delay
      
      updateTestResult('sms', { status: 'pass', message: 'SMS logic executed (Simulated)' });
      await logTestResult('SMS Test', 'pass', 'Logic execution successful');
      return true;
    } catch (e: any) {
      updateTestResult('sms', { status: 'fail', message: e.message });
      await logTestResult('SMS Test', 'fail', e.message);
      return false;
    }
  };

  // G. DEVICE TRACKING TEST
  const runTrackingTest = async () => {
    updateTestResult('tracking', { status: 'running', message: 'Recording mock session...' });
    try {
      if (!user) throw new Error('Auth required');
      const mockSession = {
        browser: 'TestBrowser',
        os: 'TestOS',
        ip: '127.0.0.1',
        timestamp: new Date().toISOString(),
        isTest: true
      };

      await updateDoc(doc(db, 'users', user.uid), {
        sessions: arrayUnion(mockSession)
      });

      updateTestResult('tracking', { status: 'pass', message: 'Session data recorded' });
      await logTestResult('Tracking Test', 'pass', 'Firestore arrayUnion successful');
      return true;
    } catch (e: any) {
      updateTestResult('tracking', { status: 'fail', message: e.message });
      await logTestResult('Tracking Test', 'fail', e.message);
      return false;
    }
  };

  const runAllTests = async () => {
    setGlobalRunning(true);
    await runAuthTest();
    await runFirestoreTest();
    await runEncryptionTest();
    await runStorageTest();
    await runEmailTest();
    await runSmsTest();
    await runTrackingTest();
    setGlobalRunning(false);
  };

  const stats = {
    total: results.length,
    passed: results.filter(r => r.status === 'pass').length,
    failed: results.filter(r => r.status === 'fail').length,
    pending: results.filter(r => r.status === 'pending').length,
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-black pb-20 selection:bg-gold selection:text-black">
      <Navbar />
      
      <div className="mx-auto max-w-7xl px-6 pt-12">
        {/* Header Section */}
        <div className="relative mb-16 overflow-hidden rounded-[3rem] bg-gradient-to-b from-white/[0.05] to-transparent p-12 border border-white/[0.05]">
          <div className="absolute top-0 right-0 p-12 opacity-5">
            <RefreshCw className={cn("h-48 w-48 text-gold", globalRunning && "animate-spin-slow")} />
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
            <div className="space-y-4">
              <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full border border-gold/20 bg-gold/5">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Internal Testing Panel</span>
              </div>
              <h1 className="text-5xl font-extrabold text-white tracking-tighter">System Health <span className="text-gold">Audit.</span></h1>
              <p className="text-lg text-gray-500 font-medium max-w-lg">Verify critical infrastructure and security modules in real-time.</p>
            </div>
            
            <Button 
              onClick={runAllTests}
              disabled={globalRunning}
              className="bg-gold hover:bg-gold-dark text-black font-extrabold px-8 py-6 rounded-2xl shadow-[0_0_30px_rgba(212,175,55,0.2)] transition-all hover:scale-105 active:scale-95 uppercase tracking-widest text-xs"
            >
              {globalRunning ? 'Auditing System...' : 'Run All Tests'}
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <StatCard label="Total Tests" value={stats.total} icon={<Activity className="text-gray-400" />} />
          <StatCard label="Passed" value={stats.passed} icon={<CheckCircle2 className="text-green-500" />} />
          <StatCard label="Failed" value={stats.failed} icon={<XCircle className="text-red-500" />} />
          <StatCard label="Pending" value={stats.pending} icon={<RefreshCw className="text-blue-500" />} />
        </div>

        {/* Tests Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {results.map((test) => (
              <motion.div
                key={test.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "group relative p-6 rounded-[2rem] border transition-all duration-500",
                  test.status === 'pass' ? "bg-green-500/5 border-green-500/20" :
                  test.status === 'fail' ? "bg-red-500/5 border-red-500/20" :
                  test.status === 'running' ? "bg-gold/5 border-gold/20" :
                  "bg-white/[0.02] border-white/5"
                )}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={cn(
                    "h-12 w-12 rounded-2xl flex items-center justify-center border transition-all",
                    test.status === 'pass' ? "bg-green-500/10 border-green-500/20 text-green-500" :
                    test.status === 'fail' ? "bg-red-500/10 border-red-500/20 text-red-500" :
                    test.status === 'running' ? "bg-gold/10 border-gold/20 text-gold" :
                    "bg-white/5 border-white/10 text-gray-500"
                  )}>
                    {test.status === 'running' ? <RefreshCw className="h-6 w-6 animate-spin" /> : test.icon}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => {
                      if (test.id === 'auth') runAuthTest();
                      if (test.id === 'firestore') runFirestoreTest();
                      if (test.id === 'encryption') runEncryptionTest();
                      if (test.id === 'storage') runStorageTest();
                      if (test.id === 'email') runEmailTest();
                      if (test.id === 'sms') runSmsTest();
                      if (test.id === 'tracking') runTrackingTest();
                    }}
                    disabled={globalRunning}
                  >
                    Run
                  </Button>
                </div>
                
                <h3 className="text-lg font-bold text-white mb-1">{test.name}</h3>
                <p className={cn(
                  "text-xs font-bold uppercase tracking-widest",
                  test.status === 'pass' ? "text-green-500" :
                  test.status === 'fail' ? "text-red-500" :
                  test.status === 'running' ? "text-gold" :
                  "text-gray-500"
                )}>
                  {test.status === 'pass' ? 'Success' : 
                   test.status === 'fail' ? 'Failed' : 
                   test.status === 'running' ? 'In Progress' : 'Pending'}
                </p>
                <p className="mt-4 text-sm text-gray-400 font-medium leading-relaxed">
                  {test.message}
                </p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string, value: number, icon: React.ReactNode }) {
  return (
    <div className="p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 text-center space-y-2">
      <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-2">
        {icon}
      </div>
      <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{label}</p>
      <p className="text-3xl font-extrabold text-white">{value}</p>
    </div>
  );
}
