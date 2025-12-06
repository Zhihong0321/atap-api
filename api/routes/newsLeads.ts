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
    response: { 200: { type: 'object' }, 500: { type: 'object' } }
  } }, async (request, reply) => {
    try {
      const result = await processRewriteQueue();
      return reply.code(200).send(result);
    } catch (error: any) {
      request.log.error(error);
      return reply.code(500).send({ message: 'Failed to process rewrites', error: String(error?.message ?? error) });
    }
  });
}
