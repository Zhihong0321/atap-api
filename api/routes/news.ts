import { FastifyInstance, FastifyRegisterOptions } from 'fastify';
import { News } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAdmin } from '../auth.js';
import { createNewsSchema, publishSchema, updateNewsSchema } from '../schemas/news.js';

const listQuerySchema = z.object({
  published: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === 'true')),
  highlight: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === 'true')),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  content_status: z.enum(['empty', 'filled']).optional(),
  category_id: z.string().uuid().optional(),
  tag_id: z.string().uuid().optional()
});

function serialize(news: News) {
  return {
    ...news,
    sources: (news.sources as unknown as any[]) ?? []
  };
}

export async function registerNewsRoutes(
  fastify: FastifyInstance,
  opts: FastifyRegisterOptions<never>
) {
  fastify.get('/news', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.flatten());
    }
    const { published, highlight, limit, offset, content_status, category_id, tag_id } = parsed.data;

    const where: Record<string, unknown> = {};
    if (published !== undefined) where.is_published = published;
    if (highlight !== undefined) where.is_highlight = highlight;
    if (category_id) where.category_id = category_id;
    if (tag_id) where.tags = { some: { id: tag_id } };
    
    if (content_status === 'empty') {
       // Assuming 'empty' means content_en is just the placeholder from ensureNewsForLead
       // "Pending rewrite for: <Title>"
       where.content_en = { startsWith: 'Pending rewrite for:' };
    } else if (content_status === 'filled') {
       where.content_en = { not: { startsWith: 'Pending rewrite for:' } };
    }

    const data = await prisma.news.findMany({
      where,
      orderBy: { news_date: 'desc' },
      include: {
        category: true,
        tags: true
      },
      take: limit,
      skip: offset
    });

    return { data: data.map(serialize) };
  });

  fastify.get('/news/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const news = await prisma.news.findUnique({ 
        where: { id },
        include: { category: true, tags: true }
    });
    if (!news) {
      return reply.notFound('News not found');
    }
    return serialize(news);
  });

  fastify.post(
    '/news',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const parsed = createNewsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(parsed.error.flatten());
      }

      const news = await prisma.news.create({
        data: {
          ...parsed.data,
          news_date: parsed.data.news_date,
          sources: parsed.data.sources ?? []
        }
      });

      return reply.code(201).send(serialize(news));
    }
  );

  fastify.put(
    '/news/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateNewsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(parsed.error.flatten());
      }

      try {
        const news = await prisma.news.update({
          where: { id },
          data: {
            ...parsed.data,
            news_date: parsed.data.news_date,
            sources: parsed.data.sources ?? undefined
          }
        });
        return serialize(news);
      } catch (error) {
        request.log.error(error);
        return reply.notFound('News not found');
      }
    }
  );

  fastify.patch(
    '/news/:id/publish',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = publishSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(parsed.error.flatten());
      }

      try {
        const news = await prisma.news.update({
          where: { id },
          data: {
            ...(parsed.data.is_published !== undefined
              ? { is_published: parsed.data.is_published }
              : {}),
            ...(parsed.data.is_highlight !== undefined
              ? { is_highlight: parsed.data.is_highlight }
              : {})
          }
        });
        return serialize(news);
      } catch (error) {
        request.log.error(error);
        return reply.notFound('News not found');
      }
    }
  );

  fastify.delete(
    '/news/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        await prisma.news.delete({ where: { id } });
        return reply.code(204).send();
      } catch (error) {
        request.log.error(error);
        return reply.notFound('News not found');
      }
    }
  );
}
