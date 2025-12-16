import { prisma } from '../prisma.js';
import { runAutomatedNewsCycle } from './newsAutomation.js';

export async function checkAndRunPendingTasks() {
  console.log('[Scheduler] Checking for pending tasks...');

  // Query: Active tasks where (now - last_run_at) > interval_hours
  // Handling the case where last_run_at is NULL (run immediately)
  const pendingTasks = await prisma.$queryRaw`
    SELECT * FROM "scheduled_searches"
    WHERE "active" = true
      AND (
        "last_run_at" IS NULL 
        OR 
        NOW() > "last_run_at" + ("interval_hours" * INTERVAL '1 hour')
      )
  `;

  const tasks = pendingTasks as any[];
  
  if (tasks.length === 0) {
      console.log('[Scheduler] No pending tasks found.');
      return [];
  }

  console.log(`[Scheduler] Found ${tasks.length} pending tasks.`);

  const results = [];

  for (const task of tasks) {
    try {
      console.log(`[Scheduler] Triggering: ${task.topic}`);
      const result = await runAutomatedNewsCycle(task.topic, task.interval_hours, task.id);
      results.push({ topic: task.topic, status: 'triggered', result });
    } catch (err: any) {
      console.error(`[Scheduler] Failed task ${task.topic}:`, err);
      results.push({ topic: task.topic, status: 'failed', error: err.message });
    }
  }

  return results;
}
