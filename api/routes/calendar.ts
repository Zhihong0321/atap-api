import { FastifyInstance, FastifyRegisterOptions } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth.js';
import { prisma } from '../prisma.js';

// Schemas
const createEventSchema = z.object({
  name_en: z.string().min(1),
  name_cn: z.string().min(1),
  name_my: z.string().min(1)
});

const createCalendarItemSchema = z.object({
  date: z.string().datetime(),
  type_of_event_id: z.string().uuid(),
  title_en: z.string().min(1),
  title_cn: z.string().min(1),
  title_my: z.string().min(1)
});

const typeOfEventSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name_en: { type: 'string' },
    name_cn: { type: 'string' },
    name_my: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'name_en', 'name_cn', 'name_my', 'created_at', 'updated_at']
} as const;

const calendarItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    date: { type: 'string', format: 'date-time' },
    type_of_event_id: { type: 'string', format: 'uuid' },
    title_en: { type: 'string' },
    title_cn: { type: 'string' },
    title_my: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    type_of_event: typeOfEventSchema
  },
  required: [
    'id',
    'date',
    'type_of_event_id',
    'title_en',
    'title_cn',
    'title_my',
    'created_at',
    'updated_at',
    'type_of_event'
  ]
} as const;

export async function registerCalendarRoutes(
  app: FastifyInstance,
  opts: FastifyRegisterOptions<never>
) {
  // List Event Types
  app.get('/event-types', {
    schema: {
      tags: ['Calendar'],
      summary: 'List event types',
      response: {
        200: { type: 'array', items: typeOfEventSchema }
      }
    }
  }, async (request, reply) => {
    const eventTypes = await prisma.typeOfEvent.findMany({
      orderBy: { created_at: 'desc' }
    });
    return eventTypes;
  });

  // Create Event Type
  app.post('/event-types', {
    preHandler: requireAdmin,
    schema: {
      tags: ['Calendar'],
      summary: 'Create event type',
      body: {
        type: 'object',
        required: ['name_en', 'name_cn', 'name_my'],
        properties: {
          name_en: { type: 'string' },
          name_cn: { type: 'string' },
          name_my: { type: 'string' }
        }
      },
      response: {
        201: typeOfEventSchema,
        409: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message']
        }
      }
    }
  }, async (request, reply) => {
    const parsed = createEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.flatten());
    }

    try {
      const eventType = await prisma.typeOfEvent.create({
        data: parsed.data
      });
      return reply.code(201).send(eventType);
    } catch (error: any) {
      if (error.code === 'P2002') {
        return reply.code(409).send({ message: 'Event type already exists' });
      }
      throw error;
    }
  });

  // List Calendar Items
  app.get('/calendar-items', {
    schema: {
      tags: ['Calendar'],
      summary: 'List calendar items',
      response: {
        200: { type: 'array', items: calendarItemSchema }
      }
    }
  }, async (request, reply) => {
    const calendarItems = await prisma.calendarItem.findMany({
      include: {
        type_of_event: true
      },
      orderBy: { date: 'desc' }
    });
    return calendarItems;
  });

  // Create Calendar Item
  app.post('/calendar-items', {
    preHandler: requireAdmin,
    schema: {
      tags: ['Calendar'],
      summary: 'Create calendar item',
      body: {
        type: 'object',
        required: ['date', 'type_of_event_id', 'title_en', 'title_cn', 'title_my'],
        properties: {
          date: { type: 'string', format: 'date-time' },
          type_of_event_id: { type: 'string', format: 'uuid' },
          title_en: { type: 'string' },
          title_cn: { type: 'string' },
          title_my: { type: 'string' }
        }
      },
      response: {
        201: calendarItemSchema,
        409: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message']
        }
      }
    }
  }, async (request, reply) => {
    const parsed = createCalendarItemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.flatten());
    }

    try {
      const calendarItem = await prisma.calendarItem.create({
        data: {
          ...parsed.data,
          date: new Date(parsed.data.date)
        },
        include: { type_of_event: true }
      });
      return reply.code(201).send(calendarItem);
    } catch (error: any) {
      if (error.code === 'P2002') {
        return reply.code(409).send({ message: 'Calendar item already exists for this date and event type' });
      }
      throw error;
    }
  });
}
