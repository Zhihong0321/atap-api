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
const TRANSLATOR_COLLECTION_UUID = 'f3a307b0-d3b8-409a-9c73-39319bfd6b02';
const ACCOUNT_NAME = 'zhihong0321@gmail'; // Account for Rewriter
const TRANSLATOR_ACCOUNT_NAME = 'yamal'; // New account for Translator

type RewriterResponse = {
  meta?: {
    headline_query?: string;
    topic_sector?: string;
    date_query?: string;
    generated_utc?: string;
  };
  article_en_html?: string;
  source_urls?: string[];
};

type TranslatorResponse = {
  translation?: string;
};

function buildRewritePrompt(headline: string, categoryInfo?: {name?: string}) { // Removed tagNames as not in new prompt
  const categorySection = categoryInfo 
    ? `The primary topic sector is ${categoryInfo.name}.`
    : '';

  return `Executive Intelligence Analyst (Green-Tech & Mobility) Role: You are a Senior Intelligence Analyst. You synthesize complex developments in Renewable Energy (Solar/Wind/Storage), Electric Mobility (EV/Battery), and Energy Policy into long-form, boardroom-ready intelligence briefings. Input: News Headline (string) Date (string) Mission: Conduct a deep-dive investigation. Avoid generic summaries. You must provide Strategic Synthesis: connecting the news to supply chains, capital flows, and regulatory frameworks. ======================== PHASE 1 — CROSS-SECTOR RESEARCH Fact-Checking: Verify technical and financial details via 3+ reputable sources. VIP Commentary: Identify a specific quote or stated position from a high-level stakeholder (e.g., Minister, CEO, or Lead Analyst). Market Tracking: Analyze the news from a Stock Investor's POV. Look for impacts on listed companies, orderbook replenishment, or sector-wide re-rating catalysts. ======================== PHASE 2 — THE INTELLIGENCE BRIEFING (HTML) Construct a deep-form HTML article. Use <br><br> for spacing between major sections. <b>Context & Catalyst:</b> <p>4–6 sentences explaining the immediate triggers. Why is this happening on this specific date?</p> <b>Executive Summary (BLUF):</b> <ul> <li><b>Core Development:</b> The "what" and "how much" (scale/magnitude).</li> <li><b>Disruption Quotient:</b> How this shifts the status quo.</li> <li><b>Strategic Takeaway:</b> The single most important implication for long-term strategy.</li> </ul> <b>Strategic Analysis:</b> <p><b>Impact & Techno-Economic Shift:</b> 6–8 sentences on consequences for the supply chain, grid, or technical standards.</p> <p><b>Stakeholder Dynamics:</b> 4–6 sentences identifying the winners and losers.</p> <b>Investor Sentiment & Market Trend:</b> <p><b>POV - Stock Market Perspective:</b> 5–8 sentences analyzing how this news moves the trend. Identify which listed counters or sectors are likely to see price volatility. Analyze if this news is a "Buy the News" event, an "Accumulation Window," or a signal of "Execution Risk." Connect the news to broader market cycles (e.g., ESG fund inflows, interest rate sensitivity, or sector-wide re-rating).</p> <b>Expert Validation & Commentary:</b> <p>A professional perspective including a relevant quote wrapped in the following tag:</p> <blockquote> "Insert the direct or paraphrased quote from the Minister, CEO, or Analyst here." </blockquote> <p>Follow with 2–3 sentences of analysis on why this viewpoint matters.</p> <b>Forecast & Risk Assessment:</b> <p><b>Short-term (0–6m):</b> Immediate market reactions or initial pilot results.</p> <p><b>Medium-term (6–24m):</b> Structural changes to the ecosystem and mass-adoption signals.</p> <b>Policy & Historical Anchor:</b> <p>6–10 sentences of deep context. Reference specific historical precedents (e.g., IRA, EU Green Deal, Malaysia's NETR).</p> ======================== PHASE 3 — JSON OUTPUT (STRICT) Return ONLY a valid JSON object.
${categorySection}
{ "meta": { "headline_query": "${headline}", "topic_sector": "Renewable | EV | Battery | Policy", "date_query": "${new Date().toISOString().split('T')[0]}", "generated_utc": "${new Date().toISOString()}" }, "article_en_html": "String (JSON-escaped HTML)", "source_urls": ["URL 1", "URL 2", "URL 3"] }

`;
}

async function callPerplexityApi(query: string, collection_uuid: string, account_name_override?: string, expectJson: boolean = true): Promise<any> {

  const url = new URL(PERPLEXITY_API_URL);

  url.searchParams.append('q', query);

  url.searchParams.append('account_name', account_name_override || ACCOUNT_NAME);

  url.searchParams.append('collection_uuid', collection_uuid);

  url.searchParams.append('mode', 'auto');

  url.searchParams.append('sources', 'web');

  url.searchParams.append('answer_only', 'true');



  console.log(`[Perplexity] Calling API (Collection: ${collection_uuid.slice(0, 8)}...)`);

  

  const controller = new AbortController();

  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout



  try {

    const response = await fetch(url.toString(), { 

        method: 'GET',

        signal: controller.signal 

    });

    clearTimeout(timeoutId);

    

    if (!response.ok) {

        const text = await response.text();

        throw new Error(`Perplexity API error: ${response.status} ${text}`);

    }



    const raw = await response.json() as any;

    

    const answerStr = raw.answer || raw.data?.answer || '';

    if (!answerStr) throw new Error('Empty answer from Perplexity');



    if (!expectJson) {

        return { answer: answerStr };

    }



    try {

        const cleanJson = answerStr.replace(/```json/g, '').replace(/```/g, '').trim();

        return JSON.parse(cleanJson);

    } catch (e) {

        // If we expected JSON but failed, log it

        console.error('[Perplexity] JSON Parse Error. Raw output:', answerStr.substring(0, 100) + '...');

        throw new Error('Failed to parse Perplexity JSON response');

    }

  } catch (error: any) {

      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {

          throw new Error('Perplexity API timed out after 60s');

      }

      throw error;

  }

}



async function callTranslatorApi(text: string, targetLanguage: 'zh_cn' | 'ms_my'): Promise<TranslatorResponse> {

  const languageMap = {

    zh_cn: 'Chinese (Simplified)',

    ms_my: 'Malay'

  };

  const prompt = `Translate the following English text to ${languageMap[targetLanguage]} and return ONLY the translated text. No markdown, no extra sentences, just the translation.\n\nEnglish Text:\n${text}`;



  // Pass expectJson = false

  const result = await callPerplexityApi(prompt, TRANSLATOR_COLLECTION_UUID, TRANSLATOR_ACCOUNT_NAME, false);

  return { translation: result.answer };

}



export async function processRewriteQueue() {
  console.log('[Rewriter] Starting queue processing...');
  let totalProcessed = 0;
  const results = [];

  while (true) {
    console.log('[Rewriter] Fetching next pending lead...');
    // Fetch one at a time to manage rate limits and allow breaking
    const leads = await prisma.newsLead.findMany({
      where: { status: 'rewrite_pending' },
      take: 1,
      include: { 
        news: {
          include: {
            category: {
              select: { name_en: true }
            }
          }
        }
      }
    });

    if (leads.length === 0) {
      console.log('[Rewriter] No more pending leads. Queue empty.');
      break; // Queue is empty
    }

    const lead = leads[0];
    console.log(`[Rewriter] Processing Lead ID: ${lead.id} (Headline: "${lead.headline.substring(0, 30)}...")`);

    if (!lead.news_id || !lead.news) {
        console.error('[Rewriter] Malformed lead (missing news link). Marking as error.');
        await prisma.newsLead.update({ where: { id: lead.id }, data: { status: 'error' } });
        continue;
    }

    try {
      const categoryInfo = lead.news.category ? {
          name: lead.news.category.name_en
      } : undefined;

      const prompt = buildRewritePrompt(lead.headline, categoryInfo);

      console.log('[Rewriter] Calling Rewriter API...');
      const result = await REWRITER_RATE_LIMITER.add(() => callPerplexityApi(prompt, REWRITER_COLLECTION_UUID));
      
      const title_en = result.meta?.headline_query ?? lead.news.title_en;
      const content_en = result.article_en_html ?? lead.news.content_en;
      console.log('[Rewriter] Rewrite complete. Starting translations...');

      // Translate title and content
      console.log('[Rewriter] Translating Title (CN)...');
      const title_cn = (await REWRITER_RATE_LIMITER.add(() => callTranslatorApi(title_en, 'zh_cn')))?.translation ?? title_en;
      
      console.log('[Rewriter] Translating Title (MY)...');
      const title_my = (await REWRITER_RATE_LIMITER.add(() => callTranslatorApi(title_en, 'ms_my')))?.translation ?? title_en;
      
      console.log('[Rewriter] Translating Content (CN)...');
      const content_cn = (await REWRITER_RATE_LIMITER.add(() => callTranslatorApi(content_en, 'zh_cn')))?.translation ?? content_en;
      
      console.log('[Rewriter] Translating Content (MY)...');
      const content_my = (await REWRITER_RATE_LIMITER.add(() => callTranslatorApi(content_en, 'ms_my')))?.translation ?? content_en;
      
      const sourcesArray = Array.isArray(result.source_urls) ? result.source_urls : [];

      console.log('[Rewriter] Updating Database...');
      const updatedNews = await prisma.news.update({
        where: { id: lead.news_id },
        data: {
          title_en,
          title_cn,
          title_my,
          content_en,
          content_cn,
          content_my,
          image_url: null, // New Rewriter schema doesn't provide image_url
          sources: sourcesArray as any,
          category_id: lead.news.category_id,
        }
      });

      await prisma.newsLead.update({
        where: { id: lead.id },
        data: { status: 'rewritten' }
      });

      console.log(`[Rewriter] Success: Lead ${lead.id}`);
      results.push({ id: lead.id, status: 'success', title: lead.headline });
      totalProcessed++;
      
    } catch (error: any) {
      console.error(`[Rewriter] Failed to rewrite lead ${lead.id}:`, error);
      await prisma.newsLead.update({
        where: { id: lead.id },
        data: { status: 'error' }
      });
      results.push({ id: lead.id, status: 'error', error: error.message });
    }
  }

  console.log(`[Rewriter] Finished. Processed ${totalProcessed} items.`);
  return { processed: totalProcessed, details: results };
}

export async function rewriteNews(newsId: string) {
  const news = await prisma.news.findUnique({
    where: { id: newsId },
    include: {
      category: {
        select: { name_en: true }
      }
    }
  });

  if (!news) {
    throw new Error('News not found');
  }

  const categoryInfo = news.category ? {
    name: news.category.name_en
  } : undefined;

  const prompt = buildRewritePrompt(
    news.title_en || news.title_cn || news.title_my,
    categoryInfo
  );

  const result = await REWRITER_RATE_LIMITER.add(() => callPerplexityApi(prompt, REWRITER_COLLECTION_UUID));

  const title_en = result.meta?.headline_query ?? news.title_en;
  const content_en = result.article_en_html ?? news.content_en;
  
  // Translate title and content
  const title_cn = (await REWRITER_RATE_LIMITER.add(() => callTranslatorApi(title_en, 'zh_cn')))?.translation ?? title_en;
  const title_my = (await REWRITER_RATE_LIMITER.add(() => callTranslatorApi(title_en, 'ms_my')))?.translation ?? title_en;
  const content_cn = (await REWRITER_RATE_LIMITER.add(() => callTranslatorApi(content_en, 'zh_cn')))?.translation ?? content_en;
  const content_my = (await REWRITER_RATE_LIMITER.add(() => callTranslatorApi(content_en, 'ms_my')))?.translation ?? content_en;

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
      image_url: null, // New Rewriter schema doesn't provide image_url
      sources: sourcesArray as any,
      category_id: news.category_id,
      // Removed tags update as the new Rewriter schema doesn't provide tags directly
    }
  });

  return { updatedNews, rewrite: result };
}
