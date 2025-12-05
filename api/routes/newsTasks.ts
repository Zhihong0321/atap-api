import { FastifyInstance, FastifyRegisterOptions } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth.js';
import { createNewsTask, runNewsTask } from '../services/newsPipeline.js';
import { prisma } from '../prisma.js';

const createTaskSchema = z.object({
  query: z.string().trim().min(3),
  account_name: z.string().trim().optional(),
  collection_uuid: z.string().trim().optional()
});

export async function registerNewsTaskRoutes(
  fastify: FastifyInstance,
  opts: FastifyRegisterOptions<never>
) {
  fastify.post('/news-tasks', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = createTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.flatten());
    }

    const task = await createNewsTask(parsed.data);
    return reply.code(201).send(task);
  });

  fastify.post('/news-tasks/:id/run', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await runNewsTask(id);
      return result;
    } catch (error: any) {
      request.log.error(error);
      return reply.code(500).send({ message: 'Failed to run task', error: String(error?.message ?? error) });
    }
  });

  fastify.get('/news-tasks/:id/leads', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const leads = await prisma.newsLead.findMany({ where: { task_id: id }, orderBy: { created_at: 'desc' } });
    return { data: leads };
  });
}
