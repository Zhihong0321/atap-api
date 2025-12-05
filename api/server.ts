import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { apiConfig } from './config.js';
import { registerNewsRoutes } from './routes/news.js';
import { registerNewsTaskRoutes } from './routes/newsTasks.js';
import { prisma } from './prisma.js';

async function buildServer() {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, { origin: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(sensible);

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Solar Atap News API',
        version: '1.0.0'
      }
    }
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs'
  });

  // Health under v1 prefix
  app.get('/api/v1/health', async () => ({ status: 'ok' }));

  // Register routes under /api/v1
  await app.register(registerNewsRoutes as any, { prefix: '/api/v1' });
  await app.register(registerNewsTaskRoutes as any, { prefix: '/api/v1' });

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  return app;
}

async function start() {
  const app = await buildServer();
  try {
    await app.listen({ port: apiConfig.port, host: apiConfig.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}

export { buildServer };
