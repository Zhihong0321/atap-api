import { FastifyInstance, FastifyRegisterOptions } from 'fastify';
import { requireAdmin } from '../auth.js';
import { processRewriteQueue } from '../services/rewriterService.js';

export async function registerNewsLeadRoutes(
  fastify: FastifyInstance,
  opts: FastifyRegisterOptions<never>
) {
  // Manual Trigger for Batch Rewrite
  fastify.post('/news-leads/process-rewrites', { preHandler: requireAdmin, schema: {
    tags: ['News Leads'],
    summary: 'Process rewrite queue',
    response: { 202: { type: 'object' }, 500: { type: 'object' } }
  } }, async (request, reply) => {
    try {
      // Run in background, do not await
      processRewriteQueue().catch(err => request.log.error(err));
      
      return reply.code(202).send({ message: 'Rewrite processing started in background' });
    } catch (error: any) {
      request.log.error(error);
      return reply.code(500).send({ message: 'Failed to start processing', error: String(error?.message ?? error) });
    }
  });
}
