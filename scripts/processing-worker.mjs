const baseUrl = (process.env.FINALIZE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const secret = process.env.FINALIZE_WORKER_SECRET;
const intervalMs = Math.max(1000, Number(process.env.FINALIZE_WORKER_INTERVAL_MS || 2500));
const maxJobs = Math.max(1, Math.min(Number(process.env.FINALIZE_WORKER_BATCH || 8), 25));
if (!secret) throw new Error('FINALIZE_WORKER_SECRET is required');

const workerId = `worker-${process.pid}-${Math.random().toString(36).slice(2,8)}`;
let stopped = false;
process.on('SIGINT', () => { stopped = true; });
process.on('SIGTERM', () => { stopped = true; });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tick() {
  const response = await fetch(`${baseUrl}/api/internal/processing/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-finalize-worker-secret': secret },
    body: JSON.stringify({ workerId, maxJobs }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.error || `Worker HTTP ${response.status}`);
  return data;
}

console.log(`[Finalize worker] ${workerId} → ${baseUrl}`);
while (!stopped) {
  try {
    const result = await tick();
    if (result.processed) console.log(`[Finalize worker] processed ${result.processed}`, result.results.map((r) => `${r.type}:${r.status}`).join(', '));
    else await sleep(intervalMs);
  } catch (error) {
    console.error('[Finalize worker]', error.message);
    await sleep(Math.max(intervalMs, 5000));
  }
}
console.log('[Finalize worker] stopped');
