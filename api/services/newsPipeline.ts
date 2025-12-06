import { prisma } from '../prisma.js';

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

export async function fetchHeadlinesFromNewsSearcher(taskId: string, query: string, collectionUuid?: string | null): Promise<HeadlineResult[]> {
  const PERPLEXITY_API_URL = 'https://ee-perplexity-wrapper-production.up.railway.app/api/query_sync';
  const accountName = 'zhihong0321@gmail'; // Updated to use valid account

  const url = new URL(PERPLEXITY_API_URL);
  url.searchParams.append('q', `Find news headlines for: ${query}. Return ONLY a JSON array of objects with "title", "url", "source", and "date" (YYYY-MM-DD format). Do not include any other text.`);
  url.searchParams.append('account_name', accountName);
  url.searchParams.append('mode', 'auto'); // Changed from research to auto to fix 500 error
  url.searchParams.append('sources', 'web');
  url.searchParams.append('answer_only', 'true');

  if (collectionUuid) {
    url.searchParams.append('collection_uuid', collectionUuid);
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Perplexity API error: ${response.status} ${text}`);
    }

    const data = await response.json() as any;
    const answerText = data.answer || data.data?.answer || '';


    // Attempt to parse JSON from the answer text
    // The LLM might wrap it in markdown code blocks ```json ... ```
    const jsonMatch = answerText.match(/```json\s*([\s\S]*?)\s*```/) || answerText.match(/```\s*([\s\S]*?)\s*```/);
    const jsonString = jsonMatch ? jsonMatch[1] : answerText;

    let parsed: any[] = [];
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      console.error('Failed to parse JSON from Perplexity response:', answerText);
      // Fallback: empty list or try to extract lines?
      // For now, empty list to avoid garbage data
      return []; 
    }

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

    return { taskId, leads, news };
  } catch (err: any) {
    await prisma.newsTask.update({ where: { id: taskId }, data: { status: 'failed', error: String(err?.message ?? err) } });
    throw err;
  }
}
