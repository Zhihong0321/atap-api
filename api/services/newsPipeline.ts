import { prisma } from '../prisma.js';
import { processRewriteQueue } from './rewriterService.js';

type CreateTaskInput = {
  query: string;
  account_name?: string | null;
  collection_uuid?: string | null;
  category_id?: string | null;
};

type HeadlineResult = {
  title: string;
  source?: string;
  url?: string;
  published_at?: string;
};

// Perplexity Wrapper response types
interface PerplexityResponse {
  status: string;
  data: {
    answer: string;
    text: string; // Sometimes mapped from answer
    sources?: Array<{
      name: string;
      url: string;
    }>;
    backend_uuid?: string;
    frontend_uuid?: string;
  };
}


const NEW_SEARCHER_COLLECTION_UUID = 'e837cb67-4c52-4d0f-be7e-b44c7acae98a';

export async function createNewsTask(input: CreateTaskInput) {
  return prisma.newsTask.create({
    data: {
      query: input.query,
      account_name: input.account_name ?? null,
      collection_uuid: input.collection_uuid ?? NEW_SEARCHER_COLLECTION_UUID,
      category_id: input.category_id ?? null,
      status: 'pending'
    }
  });
}

import { queryPerplexity } from '../utils/perplexityClient.js';

export async function fetchHeadlinesFromNewsSearcher(taskId: string, query: string, collectionUuid?: string | null): Promise<HeadlineResult[]> {
  const accountName = 'zhihong0321@gmail'; 

  const prompt = `Find news headlines for: ${query}. Return ONLY a JSON array of objects with "title", "url", "source", and "date" (YYYY-MM-DD format). Do not include any other text.`;

  try {
    const parsed = await queryPerplexity(prompt, {
      account_name: accountName,
      mode: 'auto', // Changed to auto as per previous fix
      collection_uuid: collectionUuid ?? undefined,
      expectJson: true
    });

    if (!Array.isArray(parsed)) {
      console.warn('Perplexity response is not an array:', parsed);
      return [];
    }

    // Map to HeadlineResult
    return parsed.map((item: any) => ({
      title: item.title || 'Untitled',
      source: item.source || 'Unknown',
      url: item.url || '',
      published_at: item.date || new Date().toISOString()
    }));

  } catch (error) {
    console.error('Error fetching from Perplexity Wrapper:', error);
    throw error;
  }
}

async function ensureNewsForLead(leadId: string, headline: HeadlineResult, categoryId?: string | null) {
  // For now, create a News row per headline with placeholder multilingual content.
  const placeholderContent = `Pending rewrite for: ${headline.title}`;
  const sources = [
    {
      name: headline.source ?? 'NewsSearcher',
      url: headline.url
    }
  ];

  const news = await prisma.news.create({
    data: {
      title_en: headline.title,
      title_cn: headline.title,
      title_my: headline.title,
      content_en: placeholderContent,
      content_cn: placeholderContent,
      content_my: placeholderContent,
      news_date: headline.published_at ? new Date(headline.published_at) : new Date(),
      sources,
      category_id: categoryId ?? null,
      is_published: false,
      is_highlight: false
    }
  });

  await prisma.newsLead.update({
    where: { id: leadId },
    data: {
      news_id: news.id,
      status: 'rewrite_pending'
    }
  });

  return news;
}

export async function runNewsTask(taskId: string) {
  const task = await prisma.newsTask.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new Error('Task not found');
  }

  await prisma.newsTask.update({ where: { id: taskId }, data: { status: 'running', error: null } });

  try {
    const headlines = await fetchHeadlinesFromNewsSearcher(taskId, task.query, task.collection_uuid);

    // Clean up old data: find existing leads, identify their news items, and delete everything
    const existingLeads = await prisma.newsLead.findMany({
      where: { task_id: taskId },
      select: { news_id: true }
    });

    const newsIdsToDelete = existingLeads
      .map((l) => l.news_id)
      .filter((id): id is string => id !== null);

    // Transactional cleanup to ensure consistency
    await prisma.$transaction([
      prisma.newsLead.deleteMany({ where: { task_id: taskId } }),
      prisma.news.deleteMany({ where: { id: { in: newsIdsToDelete } } })
    ]);

    const leads = await prisma.$transaction(
      headlines.map((h) =>
        prisma.newsLead.create({
          data: {
            task_id: taskId,
            headline: h.title,
            source: { name: h.source, url: h.url },
            published_at: h.published_at ? new Date(h.published_at) : null,
            status: 'pending'
          }
        })
      )
    );

    // Create News rows for each lead
    const news = [];
    for (const lead of leads) {
      const headline = headlines.find((h) => h.title === lead.headline) as HeadlineResult;
      const created = await ensureNewsForLead(lead.id, headline, task.category_id);
      news.push(created);
    }

    await prisma.newsTask.update({ where: { id: taskId }, data: { status: 'completed' } });

    // Automatically trigger rewrite queue processing in the background
    processRewriteQueue().catch(err => console.error('[AutoRewrite] Failed to trigger background process:', err));

    return { taskId, leads, news };
  } catch (err: any) {
    await prisma.newsTask.update({ where: { id: taskId }, data: { status: 'failed', error: String(err?.message ?? err) } });
    throw err;
  }
}
