import { setTimeout } from 'timers/promises';

const PERPLEXITY_BASE_URL = 'https://ee-perplexity-wrapper-production.up.railway.app';

export interface PerplexityOptions {
  account_name?: string;
  mode?: 'auto' | 'writing' | 'coding' | 'research';
  collection_uuid?: string;
  sources?: 'web' | 'scholar' | 'social';
  expectJson?: boolean;
}

export async function queryPerplexity(query: string, options: PerplexityOptions = {}) {
  const { 
    account_name = 'zhihong0321@gmail', 
    mode = 'auto', 
    collection_uuid, 
    sources = 'web',
    expectJson = true
  } = options;

  // 1. Submit Query
  const submitUrl = new URL(`${PERPLEXITY_BASE_URL}/api/query_queue_async`);
  submitUrl.searchParams.append('q', query);
  submitUrl.searchParams.append('account_name', account_name);
  submitUrl.searchParams.append('mode', mode);
  submitUrl.searchParams.append('sources', sources);
  
  if (collection_uuid) {
    submitUrl.searchParams.append('collection_uuid', collection_uuid);
  }

  // Answer only is likely implicit or handled by the wrapper's new logic, 
  // but previous code sent 'answer_only=true'. 
  // The new docs don't mention it, but we'll append it just in case if it's supported.
  submitUrl.searchParams.append('answer_only', 'true');

  console.log(`[PerplexityClient] Submitting query: "${query.substring(0, 30)}..."`);
  
  const submitRes = await fetch(submitUrl.toString(), {
    method: 'GET', // Docs say GET for submit
    headers: { 'Accept': 'application/json' }
  });

  if (!submitRes.ok) {
    const text = await submitRes.text();
    throw new Error(`Perplexity Submit Failed: ${submitRes.status} ${text}`);
  }

  const submitData = await submitRes.json() as any;
  const requestId = submitData.request_id;
  
  if (!requestId) {
    throw new Error('Perplexity Submit response missing request_id');
  }

  console.log(`[PerplexityClient] Queued. Request ID: ${requestId}`);

  // 2. Poll for Results
  const POLL_INTERVAL = 2000; // 2 seconds
  const MAX_RETRIES = 150; // 300 seconds (5 minutes) total timeout
  
  for (let i = 0; i < MAX_RETRIES; i++) {
    await setTimeout(POLL_INTERVAL);

    const checkUrl = `${PERPLEXITY_BASE_URL}/api/queue/result/${requestId}`;
    const checkRes = await fetch(checkUrl);
    
    if (!checkRes.ok) {
      console.warn(`[PerplexityClient] Poll failed ${checkRes.status}, retrying...`);
      continue;
    }

    const checkData = await checkRes.json() as any;
    
    if (checkData.status === 'completed') {
       // 3. Cleanup (Fire and forget)
       fetch(checkUrl, { method: 'DELETE' }).catch(() => {});

       const answer = checkData.result?.answer || checkData.result?.data?.answer || '';
       
       if (!expectJson) {
         return { answer };
       }

       // Parse JSON if expected
       try {
        const jsonMatch = answer.match(/```json\s*([\s\S]*?)\s*```/) || answer.match(/```\s*([\s\S]*?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[1] : answer;
        return JSON.parse(jsonString);
       } catch (e) {
         console.warn('[PerplexityClient] JSON Parse failed. Returning raw object.');
         return { answer, raw_error: 'json_parse_failed' };
       }
    }

    if (checkData.status === 'failed' || checkData.status === 'not_found') {
      throw new Error(`Perplexity Task Failed: ${checkData.error || checkData.message}`);
    }

    // If 'pending' or 'processing', continue loop
    if (i % 5 === 0) { // Log every 10 seconds
        console.log(`[PerplexityClient] Polling ${requestId}: ${checkData.status}`);
    }
  }

  throw new Error('Perplexity Task Timed Out');
}
