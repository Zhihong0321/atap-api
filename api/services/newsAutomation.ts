import { prisma } from '../prisma.js';
import { randomUUID } from 'crypto';

const PERPLEXITY_API_URL = 'https://ee-perplexity-wrapper-production.up.railway.app/api/query_sync';
const ACCOUNT_NAME = 'zhihong0321@gmail'; 

interface HeadlineResult {
  title: string;
  source?: string;
  url?: string;
  published_at?: string;
}

/**
 * Runs the automated news cycle for a specific topic.
 * 1. Calculate time window.
 * 2. Query Perplexity.
 * 3. Log raw results.
 * 4. Deduplicate (URL check).
 * 5. Create Leads.
 * 6. Update Schedule.
 */
export async function runAutomatedNewsCycle(topic: string, intervalHours: number, searchId: string) {
    const logId = randomUUID();
    const executionTime = new Date();
    // Calculate the "after date" for the prompt
    const timeWindowMs = intervalHours * 60 * 60 * 1000;
    const dateAfter = new Date(Date.now() - timeWindowMs).toISOString().split('T')[0]; // YYYY-MM-DD
    const timeSpanUsed = `Since ${dateAfter} (last ${intervalHours}h)`;

    console.log(`[NewsAuto] Starting cycle for: ${topic} (${timeSpanUsed})`);

    // 1. Construct Query
    const query = `Find news about "${topic}" published after ${dateAfter}. Return ONLY a JSON array of objects with "title", "url", "source", and "date" (YYYY-MM-DD format). Do not include any other text. Ensure sources are distinct.`;

    const url = new URL(PERPLEXITY_API_URL);
    url.searchParams.append('q', query);
    url.searchParams.append('account_name', ACCOUNT_NAME);
    url.searchParams.append('mode', 'auto');
    url.searchParams.append('sources', 'web');
    url.searchParams.append('answer_only', 'true');

    let rawResponse: any = null;
    let itemsFound = 0;
    let itemsProcessed = 0;
    let status = 'FAILED';
    let errorMessage: string | null = null;

    try {
        // 2. Fetch from Perplexity
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Perplexity API error: ${response.status} ${text}`);
        }

        const data = await response.json() as any;
        rawResponse = data; // Keep the full wrapper response
        
        const answerText = data.answer || data.data?.answer || '';

        // Extract JSON
        const jsonMatch = answerText.match(/```json\s*([\s\S]*?)\s*```/) || answerText.match(/```\s*([\s\S]*?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[1] : answerText;

        let headlines: HeadlineResult[] = [];
        try {
            headlines = JSON.parse(jsonString);
            if (!Array.isArray(headlines)) headlines = [];
        } catch (e) {
            console.warn('[NewsAuto] JSON Parse failed, trying to process empty list');
        }

        itemsFound = headlines.length;
        status = 'RAW_FETCHED';

        // 3. Log Raw Response (Immediately)
        // Using raw SQL because 'search_logs' is not in Prisma Client
        await prisma.$executeRaw`
            INSERT INTO "search_logs" ("id", "execution_time", "topic_searched", "time_span_used", "raw_response", "items_found", "items_processed", "status", "error_message")
            VALUES (${logId}::uuid, ${executionTime}, ${topic}, ${timeSpanUsed}, ${JSON.stringify(rawResponse)}::jsonb, ${itemsFound}, 0, ${status}, NULL)
        `;

        // 4. Deduplication
        const uniqueHeadlines: HeadlineResult[] = [];
        for (const h of headlines) {
            if (!h.url) continue;

            // Check if URL exists in News table (using Prisma Client normally as News exists)
            // Or use raw query if we want to be safe, but News is in schema.
            // Using standard Prisma count for safety and ease.
            // Note: Check against sources array in JSON? Or exact match?
            // Existing pipeline checks exact match in 'sources'.
            // Simpler: Check if any news has this URL in its source.
            // Since sources is Json, we use raw query for robust check or simple string contains if simple.
            // Let's stick to the user's plan: "Strict URL Check".
            
            // We'll assume strict check against any record in DB that might have this URL.
            // Efficient check:
            const exists = await prisma.news.findFirst({
                where: {
                    sources: {
                        array_contains: [{ url: h.url }] 
                    }
                }
            });
            // Note: array_contains might depend on Prisma version/Postgres. 
            // Fallback: Use raw query to check existence.
             const existsRaw = await prisma.$queryRaw`
                SELECT id FROM "News", jsonb_array_elements(sources) as src
                WHERE src->>'url' = ${h.url}
                LIMIT 1
            `;

            if ((existsRaw as any[]).length === 0) {
                uniqueHeadlines.push(h);
            }
        }

        // 5. Process Unique Items (Create NewsLeads)
        // We need a dummy Task ID to attach these leads to, OR we create a "System Task".
        // For now, we'll create a transient NewsTask for this automated run so we can track them in the existing UI too.
        const task = await prisma.newsTask.create({
            data: {
                query: `[AUTO] ${topic}`,
                status: 'completed',
                account_name: 'SYSTEM_AUTO'
            }
        });

        for (const h of uniqueHeadlines) {
            await prisma.newsLead.create({
                data: {
                    task_id: task.id,
                    headline: h.title,
                    source: { name: h.source || 'Perplexity', url: h.url },
                    published_at: h.published_at ? new Date(h.published_at) : new Date(),
                    status: 'pending' // Ready for rewrite
                }
            });
            itemsProcessed++;
        }

        status = 'SUCCESS';
        
        // Update Log
        await prisma.$executeRaw`
            UPDATE "search_logs" 
            SET "items_processed" = ${itemsProcessed}, "status" = ${status}
            WHERE "id" = ${logId}::uuid
        `;

        // Update Schedule Last Run
        await prisma.$executeRaw`
            UPDATE "scheduled_searches"
            SET "last_run_at" = NOW(), "updated_at" = NOW()
            WHERE "id" = ${searchId}::uuid
        `;

        console.log(`[NewsAuto] Cycle finished. Found ${itemsFound}, New ${itemsProcessed}`);
        return { itemsFound, itemsProcessed };

    } catch (err: any) {
        console.error('[NewsAuto] Error:', err);
        errorMessage = err.message || String(err);
        status = 'FAILED';

        // Update Log with error
        await prisma.$executeRaw`
            INSERT INTO "search_logs" ("id", "execution_time", "topic_searched", "time_span_used", "raw_response", "items_found", "items_processed", "status", "error_message")
            VALUES (${logId}::uuid, ${executionTime}, ${topic}, ${timeSpanUsed}, ${JSON.stringify(rawResponse || {})}::jsonb, ${itemsFound}, ${itemsProcessed}, ${status}, ${errorMessage})
            ON CONFLICT ("id") DO UPDATE 
            SET "status" = ${status}, "error_message" = ${errorMessage}
        `;
        throw err;
    }
}
