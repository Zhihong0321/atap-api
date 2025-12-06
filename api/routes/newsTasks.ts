import { FastifyInstance, FastifyRegisterOptions } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth.js';
import { createNewsTask, runNewsTask } from '../services/newsPipeline.js';
import { prisma } from '../prisma.js';

const taskSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    query: { type: 'string' },
    account_name: { type: 'string', nullable: true },
    collection_uuid: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
    error: { type: 'string', nullable: true },
    category_id: { type: 'string', format: 'uuid', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'query', 'status', 'created_at', 'updated_at']
} as const;

const leadSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    task_id: { type: 'string', format: 'uuid' },
    headline: { type: 'string' },
    source: { type: 'object', nullable: true },
    published_at: { type: 'string', format: 'date-time', nullable: true },
    status: { type: 'string', enum: ['pending', 'rewrite_pending', 'rewritten', 'error'] },
    news_id: { type: 'string', format: 'uuid', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'task_id', 'headline', 'status', 'created_at', 'updated_at']
} as const;

const createTaskSchema = z.object({
  query: z.string().trim().min(3),
  account_name: z.string().trim().optional(),
  collection_uuid: z.string().trim().optional(),
  category_id: z.string().uuid().optional() // New field
});

const updateTaskSchema = z.object({
  query: z.string().trim().min(3).optional(),
  account_name: z.string().trim().optional(),
  collection_uuid: z.string().trim().optional(),
  category_id: z.string().uuid().optional() // New field
});

export async function registerNewsTaskRoutes(
  fastify: FastifyInstance,
  opts: FastifyRegisterOptions<never>
) {
  // List Tasks
  fastify.get('/news-tasks', { preHandler: requireAdmin, schema: {
    tags: ['News Tasks'],
    summary: 'List news tasks',
    response: { 200: { type: 'object', properties: { data: { type: 'array', items: taskSchema } }, required: ['data'] } }
  } }, async (request, reply) => {
    const tasks = await prisma.newsTask.findMany({ orderBy: { created_at: 'desc' } });
    return { data: tasks };
  });

  // Get Single Task
  fastify.get('/news-tasks/:id', { preHandler: requireAdmin, schema: {
    tags: ['News Tasks'],
    summary: 'Get news task',
    params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    response: { 200: taskSchema, 404: { type: 'object' } }
  } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await prisma.newsTask.findUnique({ where: { id } });
    if (!task) return reply.callNotFound();
    return task;
  });

  // Create Task
  fastify.post('/news-tasks', { preHandler: requireAdmin, schema: {
    tags: ['News Tasks'],
    summary: 'Create news task',
    body: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 3 },
        account_name: { type: 'string' },
        collection_uuid: { type: 'string' },
        category_id: { type: 'string', format: 'uuid' }
      }
    },
    response: { 201: taskSchema, 400: { type: 'object' } }
  } }, async (request, reply) => {
    const parsed = createTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.flatten());
    }

    const task = await createNewsTask(parsed.data);
    return reply.code(201).send(task);
  });

  // Update Task
  fastify.put('/news-tasks/:id', { preHandler: requireAdmin, schema: {
    tags: ['News Tasks'],
    summary: 'Update news task',
    params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    body: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 3 },
        account_name: { type: 'string' },
        collection_uuid: { type: 'string' },
        category_id: { type: 'string', format: 'uuid' }
      }
    },
    response: { 200: taskSchema, 404: { type: 'object' } }
  } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.flatten());
    }

    try {
        const task = await prisma.newsTask.update({
            where: { id },
            data: parsed.data
        });
        return task;
    } catch (e) {
        return reply.callNotFound();
    }
  });

  // Delete Task
  fastify.delete('/news-tasks/:id', { preHandler: requireAdmin, schema: {
    tags: ['News Tasks'],
    summary: 'Delete news task',
    params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    response: { 204: { type: 'null' }, 404: { type: 'object' } }
  } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
        // Delete related leads first if cascade not set (safe side)
        await prisma.newsLead.deleteMany({ where: { task_id: id } });
        await prisma.newsTask.delete({ where: { id } });
        return reply.code(204).send();
    } catch (e) {
        return reply.callNotFound();
    }
  });

  fastify.post('/news-tasks/:id/run', { preHandler: requireAdmin, schema: {
    tags: ['News Tasks'],
    summary: 'Run news task discovery',
    params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    response: { 200: { type: 'object' }, 500: { type: 'object' } }
  } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await runNewsTask(id);
      return result;
    } catch (error: any) {
      request.log.error(error);
      return reply.code(500).send({ message: 'Failed to run task', error: String(error?.message ?? error) });
    }
  });

  fastify.get('/news-tasks/:id/leads', { preHandler: requireAdmin, schema: {
    tags: ['News Tasks'],
    summary: 'List leads for a task',
    params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    response: { 200: { type: 'object', properties: { data: { type: 'array', items: leadSchema } }, required: ['data'] } }
  } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const leads = await prisma.newsLead.findMany({ where: { task_id: id }, orderBy: { created_at: 'desc' } });
    return { data: leads };
  });
}
