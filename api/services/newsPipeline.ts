import { prisma } from '../prisma.js';

type CreateTaskInput = {
  query: string;
  account_name?: string | null;
  collection_uuid?: string | null;
};

type HeadlineResult = {
  title: string;
  source?: string;
  url?: string;
  published_at?: string;
};

export async function createNewsTask(input: CreateTaskInput) {
  return prisma.newsTask.create({
    data: {
      query: input.query,
      account_name: input.account_name ?? null,
      collection_uuid: input.collection_uuid ?? null,
      status: 'pending'
    }
  });
}

export async function fetchHeadlinesFromNewsSearcher(taskId: string, query: string): Promise<HeadlineResult[]> {
  // TODO: integrate with NewsSearcher (Perplexity wrapper) using task metadata.
  // Placeholder: return a small static set so pipeline can be wired end-to-end without external calls.
  return [
    {
      title: `${query} — sample headline A`,
      source: 'placeholder',
      url: 'https://example.com/a'
    },
    {
      title: `${query} — sample headline B`,
      source: 'placeholder',
      url: 'https://example.com/b'
    }
  ];
}

async function ensureNewsForLead(leadId: string, headline: HeadlineResult) {
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
    const headlines = await fetchHeadlinesFromNewsSearcher(taskId, task.query);

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
      const created = await ensureNewsForLead(lead.id, headline);
      news.push(created);
    }

    await prisma.newsTask.update({ where: { id: taskId }, data: { status: 'completed' } });

    return { taskId, leads, news };
  } catch (err: any) {
    await prisma.newsTask.update({ where: { id: taskId }, data: { status: 'failed', error: String(err?.message ?? err) } });
    throw err;
  }
}
