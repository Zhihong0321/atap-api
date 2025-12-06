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

export async function registerCalendarRoutes(
  app: FastifyInstance,
  opts: FastifyRegisterOptions<never>
) {
  // List Event Types
  app.get('/event-types', async (request, reply) => {
    const eventTypes = await prisma.typeOfEvent.findMany({
      orderBy: { created_at: 'desc' }
    });
    return eventTypes;
  });

  // Create Event Type
  app.post('/event-types', { preHandler: requireAdmin }, async (request, reply) => {
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
  app.get('/calendar-items', async (request, reply) => {
    const calendarItems = await prisma.calendarItem.findMany({
      include: {
        type_of_event: true
      },
      orderBy: { date: 'desc' }
    });
    return calendarItems;
  });

  // Create Calendar Item
  app.post('/calendar-items', { preHandler: requireAdmin }, async (request, reply) => {
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
