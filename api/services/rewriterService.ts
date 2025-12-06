import { prisma } from '../prisma.js';
import { RateLimiter } from '../utils/rateLimiter.js';

// Configuration
// 3 seconds interval = 20 calls/min max. 
// To strictly satisfy "max 15 in a min", we need 60/15 = 4 seconds interval.
// User asked for "3 sec interval" AND "max 15 in a min".
// 3s interval allows 20 calls. 4s interval allows 15 calls.
// I will use 4000ms (4s) to satisfy the stricter "15 per min" constraint safely.
const REWRITER_RATE_LIMITER = new RateLimiter(4000); 

const PERPLEXITY_API_URL = 'https://ee-perplexity-wrapper-production.up.railway.app/api/query_sync';
const REWRITER_COLLECTION_UUID = '6b8829ad-4c17-4a45-ac67-db3b017c2be6';
const ACCOUNT_NAME = 'zhihong0321@gmail';

type RewriterResponse = {
  meta?: {
    headline_query?: string;
    date_query?: string;
    generated_utc?: string;
    image_url?: string;
  };
  titles?: {
    en?: string;
    zh_cn?: string;
    ms_my?: string;
  };
  article?: {
    en_html?: string;
    zh_cn_html?: string;
    ms_my_html?: string;
  };
  data?: {
    en?: LanguageContent;
    zh_cn?: LanguageContent;
    ms_my?: LanguageContent;
  };
  tags?: string[];
  source_urls?: string[];
};

type LanguageContent = {
  context_warming?: string;
  main_points?: string[];
  analysis?: Record<string, any>;
  background_context?: string;
};

function buildRewritePrompt(headline: string, tagNames?: string[], categoryInfo?: {name?: string, description?: string}) {
  const tagSection = tagNames && tagNames.length
    ? `Select up to 3 tags strictly from this list: [${tagNames.join(', ')}] and return them as a "tags" array.`
    : 'If no tags list is provided, return an empty "tags" array.';
    
  const categorySection = categoryInfo 
    ? `Category context: ${categoryInfo.name}${categoryInfo.description ? ` - ${categoryInfo.description}` : ''}.`
    : '';

  return `Rewrite the following news headline into structured JSON.

Headline: "${headline}"
${categorySection}

Return ONLY valid JSON (no markdown fences) with this shape:
{
  "meta": {
    "headline_query": string,
    "date_query": string (YYYY-MM-DD if available, else today),
    "generated_utc": string (ISO),
    "image_url": string | null
  },
  "titles": {
    "en": string,
    "zh_cn": string,
    "ms_my": string
  },
  "article": {
    "en_html": string,
    "zh_cn_html": string,
    "ms_my_html": string
  },
  "tags": string[],
  "source_urls": string[]
}

Content rules:
- Provide concise, publish-ready HTML paragraphs and bullet lists in each language field.
- Provide translated titles in each language in the "titles" field.
- ${tagSection}
- ${categorySection ? 'Tailor content to match the category context and theme.' : ''}
- Do not include markdown code fences.
- Keep output strictly valid JSON.`;
}

async function callRewriterApi(query: string): Promise<RewriterResponse> {
  const url = new URL(PERPLEXITY_API_URL);
  url.searchParams.append('q', query);
  url.searchParams.append('account_name', ACCOUNT_NAME);
  url.searchParams.append('collection_uuid', REWRITER_COLLECTION_UUID);
  url.searchParams.append('mode', 'auto');
  url.searchParams.append('sources', 'web');
  url.searchParams.append('answer_only', 'true');

  const response = await fetch(url.toString(), { method: 'GET' });
  
  if (!response.ok) {
      const text = await response.text();
      throw new Error(`Perplexity API error: ${response.status} ${text}`);
  }

  const raw = await response.json() as any;
  
  // Extract answer from various possible locations
  const answerStr = raw.answer || raw.data?.answer || '';
  if (!answerStr) throw new Error('Empty answer from Perplexity');

  try {
      // Clean markdown code blocks if present
      const cleanJson = answerStr.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
  } catch (e) {
      throw new Error('Failed to parse Rewriter JSON response');
  }
}

function formatContent(content?: LanguageContent): string {
    if (!content) return '';
    
    const points = content.main_points?.map(p => `<li>${p}</li>`).join('') || '';
    const analysis = content.analysis ? JSON.stringify(content.analysis, null, 2) : ''; // Keep analysis simple for now or format better
    
    // Simple HTML format
    return `
      <p>${content.context_warming || ''}</p>
      <ul>${points}</ul>
      <p>${content.background_context || ''}</p>
      <!-- Analysis Data: ${analysis} -->
    `.trim();
}

export async function processRewriteQueue() {
  // 1. Fetch pending leads
  const leads = await prisma.newsLead.findMany({
    where: { status: 'rewrite_pending' },
    take: 10, // Process in batches of 10 to avoid long running request
    include: { 
      news: {
        include: {
          category: {
            include: { tags: true }
          }
        }
      }
    }
  });

  const results = [];

  for (const lead of leads) {
    if (!lead.news_id || !lead.news) continue;

    try {
      let availableTags: any[] = [];
      let categoryInfo: {name?: string, description?: string} | undefined = undefined;
      if (lead.news.category) {
        if (lead.news.category.tags.length > 0) {
          availableTags = lead.news.category.tags;
        }
        categoryInfo = {
          name: lead.news.category.name_en, // Use new multilingual name field
          description: lead.news.category.description_en || undefined
        };
      }

      const prompt = buildRewritePrompt(
        lead.headline,
        availableTags.map((t) => t.name),
        categoryInfo
      );

      // 2. Schedule API call with Rate Limiter
      const result = await REWRITER_RATE_LIMITER.add(() => callRewriterApi(prompt));
      
      // Match returned tags with DB tags
      const connectTags: { id: string }[] = [];
      if (result.tags && Array.isArray(result.tags)) {
        result.tags.forEach(tagName => {
           const found = availableTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
           if (found) connectTags.push({ id: found.id });
        });
      }

      const title_en = result.titles?.en ?? lead.news.title_en;
      const title_cn = result.titles?.zh_cn ?? lead.news.title_cn;
      const title_my = result.titles?.ms_my ?? lead.news.title_my;
      
      const content_en = result.article?.en_html ?? formatContent(result.data?.en);
      const content_cn = result.article?.zh_cn_html ?? formatContent(result.data?.zh_cn);
      const content_my = result.article?.ms_my_html ?? formatContent(result.data?.ms_my);
      const sourcesArray = Array.isArray(result.source_urls) ? result.source_urls : [];

      // 3. Update Database
      const updatedNews = await prisma.news.update({
        where: { id: lead.news_id },
        data: {
          title_en,
          title_cn,
          title_my,
          content_en,
          content_cn,
          content_my,
          image_url: result.meta?.image_url || null,
          sources: sourcesArray as any, // Save sources array
          category_id: lead.news.category_id, // Preserve the existing category
          tags: {
            connect: connectTags
          }
        }
      });

      await prisma.newsLead.update({
        where: { id: lead.id },
        data: { status: 'rewritten' }
      });

      results.push({ id: lead.id, status: 'success', title: lead.headline, tags: connectTags.length });
      
    } catch (error: any) {
      console.error(`Failed to rewrite lead ${lead.id}:`, error);
      await prisma.newsLead.update({
        where: { id: lead.id },
        data: { status: 'error' } // Mark as error so we don't retry infinitely immediately
      });
      results.push({ id: lead.id, status: 'error', error: error.message });
    }
  }

  return { processed: results.length, details: results };
}

export async function rewriteNews(newsId: string) {
  const news = await prisma.news.findUnique({
    where: { id: newsId },
    include: {
      category: { include: { tags: true } }
    }
  });

  if (!news) {
    throw new Error('News not found');
  }

  const availableTags = news.category?.tags ?? [];
  const categoryInfo = news.category ? {
    name: news.category.name_en, // Use new multilingual name field
    description: news.category.description_en || undefined
  } : undefined;

  const prompt = buildRewritePrompt(
    news.title_en || news.title_cn || news.title_my,
    availableTags.map((t) => t.name),
    categoryInfo
  );

  const result = await REWRITER_RATE_LIMITER.add(() => callRewriterApi(prompt));

  const connectTags: { id: string }[] = [];
  if (result.tags && Array.isArray(result.tags)) {
    result.tags.forEach((tagName) => {
      const found = availableTags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
      if (found) connectTags.push({ id: found.id });
    });
  }

  const title_en = result.titles?.en ?? news.title_en;
  const title_cn = result.titles?.zh_cn ?? news.title_cn;
  const title_my = result.titles?.ms_my ?? news.title_my;
  
  const content_en = result.article?.en_html ?? formatContent(result.data?.en);
  const content_cn = result.article?.zh_cn_html ?? formatContent(result.data?.zh_cn);
  const content_my = result.article?.ms_my_html ?? formatContent(result.data?.ms_my);
  const sourcesArray = Array.isArray(result.source_urls) ? result.source_urls : [];

  const updatedNews = await prisma.news.update({
    where: { id: newsId },
    data: {
      title_en,
      title_cn,
      title_my,
      content_en,
      content_cn,
      content_my,
      image_url: result.meta?.image_url || null,
      sources: sourcesArray as any,
      category_id: news.category_id, // Preserve the existing category
      tags: { connect: connectTags }
    }
  });

  return { updatedNews, rewrite: result };
}
