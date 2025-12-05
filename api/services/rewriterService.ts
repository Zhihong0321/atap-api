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
    image_url?: string;
  };
  data?: {
    en?: LanguageContent;
    zh_cn?: LanguageContent;
    ms_my?: LanguageContent;
  };
  source_urls?: string[];
};

type LanguageContent = {
  context_warming?: string;
  main_points?: string[];
  analysis?: Record<string, any>;
  background_context?: string;
};

async function callRewriterApi(headline: string): Promise<RewriterResponse> {
  const url = new URL(PERPLEXITY_API_URL);
  url.searchParams.append('q', headline);
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
    include: { news: true }
  });

  const results = [];

  for (const lead of leads) {
    if (!lead.news_id) continue;

    try {
      // 2. Schedule API call with Rate Limiter
      const result = await REWRITER_RATE_LIMITER.add(() => callRewriterApi(lead.headline));
      
      // 3. Update Database
      const updatedNews = await prisma.news.update({
        where: { id: lead.news_id },
        data: {
          content_en: formatContent(result.data?.en),
          content_cn: formatContent(result.data?.zh_cn),
          content_my: formatContent(result.data?.ms_my),
          image_url: result.meta?.image_url || null,
          sources: result.source_urls as any, // Save sources array
        }
      });

      await prisma.newsLead.update({
        where: { id: lead.id },
        data: { status: 'rewritten' }
      });

      results.push({ id: lead.id, status: 'success', title: lead.headline });
      
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
