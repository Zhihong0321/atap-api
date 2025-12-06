import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { apiConfig } from './config.js';
import { registerNewsRoutes } from './routes/news.js';
import { registerNewsTaskRoutes } from './routes/newsTasks.js';
import { registerNewsLeadRoutes } from './routes/newsLeads.js';
import { registerCategoryRoutes } from './routes/categories.js';
import { prisma } from './prisma.js';
import { requireAdmin } from './auth.js';

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

  // Root route redirect
  app.get('/', async (request, reply) => {
    return reply.redirect('/api-guide');
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

        <hr>

        <h2>Workflow Guide for Frontend Team</h2>
        <p>This system operates in a 4-step pipeline. The Admin Dashboard should reflect these stages:</p>

        <h3>Step 1: Discovery (Task Manager)</h3>
        <p><strong>Goal:</strong> Find latest news headlines.</p>
        <ol>
            <li>Admin creates a task (e.g., Query: "Malaysia Solar 2025").</li>
            <li>Admin clicks <strong>"Run Discovery"</strong> (<code>POST /news-tasks/:id/run</code>).</li>
            <li><strong>System Action:</strong> Fetches headlines, creates <code>NewsLead</code> items, and creates placeholder <code>News</code> entries (Status: <em>Pending Rewrite</em>).</li>
        </ol>

        <h3>Step 2: Content Generation (Rewriter)</h3>
        <p><strong>Goal:</strong> Turn headlines into full articles with images.</p>
        <ol>
            <li>Admin checks the <strong>"Rewrite Queue"</strong> (Dashboard shows pending count).</li>
            <li>Admin clicks <strong>"Process Batch"</strong> (<code>POST /news-leads/process-rewrites</code>).</li>
            <li><strong>System Action:</strong> 
                <ul>
                    <li>Picks 10 pending leads.</li>
                    <li>Calls AI Rewriter (Rate Limited: 4s interval).</li>
                    <li>Updates <code>News</code> with full content (EN/CN/MY), cover image, and sources.</li>
                    <li>Marks lead as <em>Rewritten</em>.</li>
                </ul>
            </li>
        </ol>

        <h3>Step 3: Editorial Review (CMS)</h3>
        <p><strong>Goal:</strong> Final polish before publishing.</p>
        <ol>
            <li>Admin goes to <strong>"News Management"</strong>.</li>
            <li>Filters by <code>content_status=filled</code> to see generated articles.</li>
            <li>Admin reviews/edits content (<code>PUT /news/:id</code>).</li>
        </ol>

        <h3>Step 4: Publish</h3>
        <p><strong>Goal:</strong> Make it live on the portal.</p>
        <ol>
            <li>Admin toggles <strong>"Publish"</strong> (<code>PATCH /news/:id/publish</code>).</li>
            <li>News becomes visible on the public endpoint (<code>GET /news?published=true</code>).</li>
        </ol>

        <hr>

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

        <h3>Manual Trigger (Discovery)</h3>
        <pre><code>POST /news-tasks/:id/run</code></pre>

        <h3>Trigger Content Rewriter (Batch)</h3>
        <pre><code>POST /news-leads/process-rewrites</code></pre>
        <p>Processes up to 10 pending leads per call. Call repeatedly until queue is empty.</p>

        <h2>2. Category Management</h2>
        
        <h3>List Categories</h3>
        <pre><code>GET /categories</code></pre>

        <h3>Create Category</h3>
        <pre><code>POST /categories
{
  "name": "Solar"
}</code></pre>

        <h3>Update Category</h3>
        <pre><code>PUT /categories/:id
{
  "name": "Updated Name"
}</code></pre>

        <h3>Delete Category</h3>
        <pre><code>DELETE /categories/:id</code></pre>

        <h3>Create Tag (under Category)</h3>
        <pre><code>POST /categories/:id/tags
{
  "name": "PV Modules"
}</code></pre>

        <h3>Delete Tag</h3>
        <pre><code>DELETE /tags/:id</code></pre>

        <h2>3. News Management</h2>

        <h3>List News (Public / Admin Filter)</h3>
        <pre><code>GET /news?limit=20&offset=0&published=true&content_status=empty&category_id=...&tag_id=...</code></pre>
        <ul>
            <li><code>content_status=empty</code>: Headlines only (Pending rewrite)</li>
            <li><code>content_status=filled</code>: Full content available</li>
            <li><code>category_id</code>: Filter by Category UUID</li>
            <li><code>tag_id</code>: Filter by Tag UUID</li>
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
  await app.register(registerNewsLeadRoutes as any, { prefix: '/api/v1' });
  await app.register(registerCategoryRoutes as any, { prefix: '/api/v1' });

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
