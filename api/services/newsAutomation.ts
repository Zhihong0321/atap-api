import { prisma } from '../prisma.js';
import { randomUUID } from 'crypto';
import { queryPerplexity } from '../utils/perplexityClient.js';

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

    let rawResponse: any = null;
    let itemsFound = 0;
    let itemsProcessed = 0;
    let status = 'FAILED';
    let errorMessage: string | null = null;

    try {
        // 2. Fetch from Perplexity (Async Queue)
        const headlines = await queryPerplexity(query, {
            account_name: ACCOUNT_NAME,
            mode: 'auto',
            expectJson: true
        });

        rawResponse = headlines; // Log the parsed result

        if (!Array.isArray(headlines)) {
             console.warn('[NewsAuto] Perplexity response is not an array:', headlines);
             // Proceed with empty list or throw? Existing logic tried to continue.
             // If expectJson=true and it returns non-array, likely issue.
        }
        
        const safeHeadlines = Array.isArray(headlines) ? headlines : [];
        itemsFound = safeHeadlines.length;
        status = 'RAW_FETCHED';

        // 3. Log Raw Response (Immediately)
        await prisma.$executeRaw`
            INSERT INTO "search_logs" ("id", "execution_time", "topic_searched", "time_span_used", "raw_response", "items_found", "items_processed", "status", "error_message")
            VALUES (${logId}::uuid, ${executionTime}, ${topic}, ${timeSpanUsed}, ${JSON.stringify(rawResponse)}::jsonb, ${itemsFound}, 0, ${status}, NULL)
        `;

        // 4. Deduplication
        const uniqueHeadlines: HeadlineResult[] = [];
        for (const h of safeHeadlines) {
            if (!h.url) continue;

            // Efficient check:
            const exists = await prisma.news.findFirst({
                where: {
                    sources: {
                        array_contains: [{ url: h.url }] 
                    }
                }
            });
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
