import { FastifyInstance } from 'fastify';
import { checkAndRunPendingTasks } from '../services/schedulerService.js';

export async function registerSchedulerRoutes(app: FastifyInstance) {
  app.post('/scheduler/run-pending-tasks', async (request, reply) => {
    try {
      const results = await checkAndRunPendingTasks();
      return reply.send({ 
        message: results.length > 0 ? 'Tasks executed' : 'No tasks pending',
        results 
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Scheduler execution failed' });
    }
  });
}
