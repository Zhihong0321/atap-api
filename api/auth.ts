import { FastifyReply, FastifyRequest } from 'fastify';
import { apiConfig } from './config.js';

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const headerToken =
    (request.headers['x-admin-token'] as string | undefined) ||
    (request.headers.authorization?.replace('Bearer ', '') as string | undefined);

  if (!apiConfig.adminToken) {
    return reply.status(500).send({ error: 'ADMIN_TOKEN not configured' });
  }

  if (headerToken !== apiConfig.adminToken) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
}
