/**
 * Cron Automation Script
 * Triggers the liveness check-status API locally.
 * Usage: npm run cron:local
 */

async function triggerCron() {
  const LOCAL_API_URL = 'http://localhost:3000/api/cron/check-status';
  
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toLocaleTimeString()}] Starting Liveness Cron Check...`);
  console.log(`Target: ${LOCAL_API_URL}`);
  
  try {
    const response = await fetch(LOCAL_API_URL, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Cron Job Executed Successfully');
      console.log('Results:', JSON.stringify(data, null, 2));
    } else {
      console.error('❌ Cron Job Failed');
      console.error('Status:', response.status);
      console.error('Error:', data);
    }
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Error: Local server not running. Please run "npm run dev" first.');
    } else {
      console.error('❌ Error triggering cron:', error.message);
    }
  }
  console.log('--------------------------------------------------');
}

// Run immediately
triggerCron();

// Optional: Keep running every 60 seconds if desired
if (process.argv.includes('--watch')) {
  console.log('Watch mode enabled. Running every 60 seconds...');
  setInterval(triggerCron, 60000);
}
