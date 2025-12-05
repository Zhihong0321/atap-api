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

  // API Documentation Page (Markdown Render)
  app.get('/api-guide', async (request, reply) => {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>API Documentation Guide</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5.5.0/github-markdown.min.css">
        <style>
            body { box-sizing: border-box; min-width: 200px; max-width: 980px; margin: 0 auto; padding: 45px; }
            @media (max-width: 767px) { body { padding: 15px; } }
        </style>
      </head>
      <body class="markdown-body">
        <h1>Admin Dashboard & News API Documentation</h1>
        <p><strong>Base URL</strong>: <code>https://api-atap-solar-production.up.railway.app/api/v1</code></p>
        
        <h2>Authentication</h2>
        <p>All Admin endpoints require the <code>Authorization</code> header (Bearer Token).</p>

        <h2>1. News Task Manager (Admin)</h2>
        
        <h3>List All Query Tasks</h3>
        <pre><code>GET /news-tasks</code></pre>
        
        <h3>Create Query Task</h3>
        <pre><code>POST /news-tasks
{
  "query": "Solar Policy 2025",
  "account_name": "optional",
  "collection_uuid": "optional"
}</code></pre>

        <h3>Update Query Task</h3>
        <pre><code>PUT /news-tasks/:id
{
  "query": "Updated Query"
}</code></pre>

        <h3>Delete Task</h3>
        <pre><code>DELETE /news-tasks/:id</code></pre>

        <h3>Manual Trigger (Run Task)</h3>
        <pre><code>POST /news-tasks/:id/run</code></pre>

        <h2>2. News Management</h2>

        <h3>List News (Public / Admin Filter)</h3>
        <pre><code>GET /news?limit=20&offset=0&published=true&content_status=empty</code></pre>
        <ul>
            <li><code>content_status=empty</code>: Headlines only (Pending rewrite)</li>
            <li><code>content_status=filled</code>: Full content available</li>
        </ul>

        <h3>Update News (Admin)</h3>
        <pre><code>PUT /news/:id
{
  "title_en": "...",
  "content_en": "..."
}</code></pre>

        <h3>Publish/Highlight</h3>
        <pre><code>PATCH /news/:id/publish
{
  "is_published": true
}</code></pre>
      </body>
      </html>
    `;
    reply.type('text/html').send(html);
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
