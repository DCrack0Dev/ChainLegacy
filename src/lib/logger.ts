import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export type LogType = 'error' | 'warning' | 'info' | 'success';

interface LogEntry {
  type: LogType;
  message: string;
  details?: any;
  userId?: string;
  source?: string;
  timestamp?: any;
}

/**
 * Global logging system for ChainLegacy
 * Stores logs in /SystemLogs collection for audit and debugging
 */
export async function logSystemEvent(entry: LogEntry) {
  try {
    // 1. Console logging (environment aware)
    if (process.env.NODE_ENV === 'development') {
      const color = entry.type === 'error' ? '\x1b[31m' : entry.type === 'warning' ? '\x1b[33m' : '\x1b[32m';
      console.log(`${color}[${entry.type.toUpperCase()}][${entry.source || 'System'}] ${entry.message}\x1b[0m`, entry.details || '');
    }

    // 2. Firestore logging
    const logData = {
      ...entry,
      timestamp: serverTimestamp(),
      environment: process.env.NODE_ENV,
    };

    // Filter out sensitive data if any leaked into details
    if (logData.details) {
      const sensitiveKeys = ['password', 'secret', 'key', 'apiKey', 'token'];
      const cleanDetails = { ...logData.details };
      sensitiveKeys.forEach(key => {
        if (key in cleanDetails) cleanDetails[key] = '[REDACTED]';
      });
      logData.details = cleanDetails;
    }

    await addDoc(collection(db, 'SystemLogs'), logData);
  } catch (e) {
    // Failsafe: if Firestore logging fails, at least log to console
    console.error('CRITICAL: Failed to log system event', e);
  }
}

/**
 * Performance monitoring wrapper
 */
export async function withPerformanceLog<T>(
  name: string,
  fn: () => Promise<T>,
  userId?: string
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    
    if (duration > 2000) {
      await logSystemEvent({
        type: 'warning',
        message: `Slow action detected: ${name} took ${(duration / 1000).toFixed(2)}s`,
        source: 'Performance',
        userId,
        details: { durationMs: duration }
      });
    }
    return result;
  } catch (error: any) {
    await logSystemEvent({
      type: 'error',
      message: `Action failed: ${name}`,
      source: 'Performance',
      userId,
      details: { error: error.message }
    });
    throw error;
  }
}
