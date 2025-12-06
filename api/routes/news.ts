import { FastifyInstance, FastifyRegisterOptions } from 'fastify';
import { News } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAdmin } from '../auth.js';
import { createNewsSchema, publishSchema, updateNewsSchema } from '../schemas/news.js';
import { saveNewsImageFromBuffer } from '../utils/storage.js';
import { rewriteNews } from '../services/rewriterService.js';
import path from 'path';

const tagSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    category_id: { type: 'string', format: 'uuid' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'name', 'category_id', 'created_at', 'updated_at']
} as const;

const categorySchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name_en: { type: 'string' },
    name_cn: { type: 'string' },
    name_my: { type: 'string' },
    description_en: { type: 'string', nullable: true },
    description_cn: { type: 'string', nullable: true },
    description_my: { type: 'string', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'name_en', 'name_cn', 'name_my', 'created_at', 'updated_at']
} as const;

const newsSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    title_en: { type: 'string' },
    title_cn: { type: 'string' },
    title_my: { type: 'string' },
    content_en: { type: 'string' },
    content_cn: { type: 'string' },
    content_my: { type: 'string' },
    news_date: { type: 'string', format: 'date-time' },
    image_url: { type: 'string', nullable: true },
    sources: { type: 'array', items: { type: 'object' } },
    is_published: { type: 'boolean' },
    is_highlight: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    category_id: { type: 'string', format: 'uuid', nullable: true },
    category: { ...categorySchema, nullable: true },
    tags: { type: 'array', items: tagSchema, nullable: true }
  },
  required: [
    'id',
    'title_en',
    'title_cn',
    'title_my',
    'content_en',
    'content_cn',
    'content_my',
    'news_date',
    'is_published',
    'is_highlight',
    'created_at',
    'updated_at',
    'sources'
  ]
} as const;

const listQueryJsonSchema = {
  type: 'object',
  properties: {
    published: { type: 'string', enum: ['true', 'false'] },
    highlight: { type: 'string', enum: ['true', 'false'] },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    offset: { type: 'integer', minimum: 0, default: 0 },
    content_status: { type: 'string', enum: ['empty', 'filled'] },
    category_id: { type: 'string', format: 'uuid' },
    tag_id: { type: 'string', format: 'uuid' }
  }
} as const;

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

const imageUploadSchema = z.object({
  image_base64: z.string().min(1),
  filename: z.string().optional(),
  content_type: z.string().optional()
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
  fastify.get('/news', {
    schema: {
      tags: ['News'],
      summary: 'List news',
      querystring: listQueryJsonSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: newsSchema }
          },
          required: ['data']
        },
        400: { type: 'object' }
      }
    }
  }, async (request, reply) => {
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

  fastify.get('/news/:id', {
    schema: {
      tags: ['News'],
      summary: 'Get news detail',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      response: {
        200: newsSchema,
        404: { type: 'object' }
      }
    }
  }, async (request, reply) => {
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
    { preHandler: requireAdmin, schema: {
      tags: ['News'],
      summary: 'Create news',
      body: {
        type: 'object',
        required: ['title_en','title_cn','title_my','content_en','content_cn','content_my','news_date'],
        properties: {
          title_en: { type: 'string' },
          title_cn: { type: 'string' },
          title_my: { type: 'string' },
          content_en: { type: 'string' },
          content_cn: { type: 'string' },
          content_my: { type: 'string' },
          news_date: { type: 'string', format: 'date-time' },
          sources: { type: 'array', items: { type: 'object' } },
          is_published: { type: 'boolean' },
          is_highlight: { type: 'boolean' },
          category_id: { type: 'string', format: 'uuid' }
        }
      },
      response: { 201: newsSchema, 400: { type: 'object' } }
    } },
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
    { preHandler: requireAdmin, schema: {
      tags: ['News'],
      summary: 'Update news',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          title_en: { type: 'string' },
          title_cn: { type: 'string' },
          title_my: { type: 'string' },
          content_en: { type: 'string' },
          content_cn: { type: 'string' },
          content_my: { type: 'string' },
          news_date: { type: 'string', format: 'date-time' },
          sources: { type: 'array', items: { type: 'object' } },
          is_published: { type: 'boolean' },
          is_highlight: { type: 'boolean' },
          category_id: { type: 'string', format: 'uuid' },
          categoryId: { type: 'string', format: 'uuid' },
          category: { type: 'object' }
        }
      },
      response: { 200: newsSchema, 400: { type: 'object' }, 404: { type: 'object' } }
    } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateNewsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(parsed.error.flatten());
      }

      // Accept multiple shapes for category input
      const resolveCategoryId = (body: any): string | null | undefined => {
        if (!body || typeof body !== 'object') return undefined;
        if ('category_id' in body) return body.category_id ?? null;
        if ('categoryId' in body) return body.categoryId ?? null;
        if ('category' in body) {
          const cat = body.category;
          if (cat === null) return null;
          if (typeof cat === 'string') return cat;
          if (cat && typeof cat === 'object') {
            if ('connect' in cat && cat.connect?.id) return cat.connect.id;
            if ('id' in cat && cat.id) return cat.id;
          }
        }
        return undefined;
      };

      const categoryInput = resolveCategoryId(request.body);
      let categoryData: { connect?: { id: string }; disconnect?: boolean } | undefined;

      if (categoryInput !== undefined) {
        if (categoryInput === null) {
          categoryData = { disconnect: true };
        } else {
          const catIdParsed = z.string().uuid().safeParse(categoryInput);
          if (!catIdParsed.success) {
            return reply.code(400).send({ message: 'Invalid category id' });
          }
          categoryData = { connect: { id: catIdParsed.data } };
        }
      }

      try {
        const news = await prisma.news.update({
          where: { id },
          data: {
            ...parsed.data,
            news_date: parsed.data.news_date,
            sources: parsed.data.sources ?? undefined,
            ...(categoryData ? { category: categoryData } : {})
          }
        });
        return serialize(news);
      } catch (error) {
        request.log.error(error);
        return reply.notFound('News not found');
      }
    }
  );

  fastify.post(
    '/news/:id/image',
    { preHandler: requireAdmin, schema: {
      tags: ['News'],
      summary: 'Upload/set news image',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['image_base64'],
        properties: {
          image_base64: { type: 'string' },
          filename: { type: 'string' },
          content_type: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            image_url: { type: 'string', nullable: true },
            stored_as: { type: 'string' }
          },
          required: ['image_url', 'stored_as']
        },
        400: { type: 'object' }
      }
    } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = imageUploadSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(parsed.error.flatten());
      }

      const decodeBase64Image = (input: string) => {
        const dataPart = input.includes('base64,') ? input.split('base64,')[1] : input;
        if (!dataPart) throw new Error('Invalid base64 payload');
        return Buffer.from(dataPart, 'base64');
      };

      const guessExt = (filename?: string, contentType?: string) => {
        const map: Record<string, string> = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp',
          'image/gif': 'gif'
        };
        if (contentType && map[contentType]) return map[contentType];
        if (filename) {
          const ext = path.extname(filename).replace('.', '');
          if (ext) return ext;
        }
        return undefined;
      };

      try {
        const buffer = decodeBase64Image(parsed.data.image_base64);
        const ext = guessExt(parsed.data.filename, parsed.data.content_type);
        const saved = await saveNewsImageFromBuffer(buffer, ext);

        const news = await prisma.news.update({
          where: { id },
          data: { image_url: saved.publicPath }
        });

        return reply.code(200).send({ image_url: news.image_url, stored_as: saved.filename });
      } catch (error: any) {
        request.log.error(error);
        return reply.code(400).send({ message: error?.message || 'Failed to save image' });
      }
    }
  );

  fastify.post(
    '/news/:id/rewrite',
    { preHandler: requireAdmin, schema: {
      tags: ['News'],
      summary: 'Rewrite news content',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      response: {
        200: {
          type: 'object',
          properties: {
            news: newsSchema,
            rewrite: { type: 'object' }
          },
          required: ['news', 'rewrite']
        },
        404: { type: 'object' },
        500: { type: 'object' }
      }
    } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const { updatedNews, rewrite } = await rewriteNews(id);
        return reply.code(200).send({ news: serialize(updatedNews as any), rewrite });
      } catch (error: any) {
        request.log.error(error);
        const message = error?.message || 'Failed to rewrite news';
        if (message === 'News not found') return reply.notFound(message);
        return reply.code(500).send({ message });
      }
    }
  );

  fastify.patch(
    '/news/:id/publish',
    { preHandler: requireAdmin, schema: {
      tags: ['News'],
      summary: 'Publish/highlight toggle',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          is_published: { type: 'boolean' },
          is_highlight: { type: 'boolean' }
        }
      },
      response: { 200: newsSchema, 400: { type: 'object' }, 404: { type: 'object' } }
    } },
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
          },
          include: { category: true, tags: true }
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
    { preHandler: requireAdmin, schema: {
      tags: ['News'],
      summary: 'Delete news',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      response: { 204: { type: 'null' }, 404: { type: 'object' } }
    } },
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
