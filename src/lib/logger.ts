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
 * Global client-side logging system for ChainLegacy.
 * Server-side audit events are written through EventService with Firebase Admin.
 */
export async function logSystemEvent(entry: LogEntry) {
  try {
    // 1. Console logging (environment aware)
    if (process.env.NODE_ENV === 'development') {
      const color = entry.type === 'error' ? '\x1b[31m' : entry.type === 'warning' ? '\x1b[33m' : '\x1b[32m';
      console.log(`${color}[${entry.type.toUpperCase()}][${entry.source || 'System'}] ${entry.message}\x1b[0m`, entry.details || '');
    }

    // SystemLogs is server-admin-only; client failures remain in the browser console.
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
