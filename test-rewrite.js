import https from 'https';
import http from 'http';

// Get token from environment or use placeholder
const TOKEN = process.env.ADMIN_TOKEN || 'YOUR_ADMIN_TOKEN_HERE';
const BASE_URL = 'https://api-atap-solar-production.up.railway.app';

function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function testRewrite() {
  try {
    // Step 1: Get a news item
    console.log('Fetching news items...');
    const listOptions = {
      hostname: 'api-atap-solar-production.up.railway.app',
      path: '/news?limit=1',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    };
    
    const listResponse = await makeRequest(listOptions);
    
    if (listResponse.status !== 200 || !listResponse.data.data || listResponse.data.data.length === 0) {
      console.error('No news items found or error:', listResponse);
      return;
    }
    
    const newsItem = listResponse.data.data[0];
    console.log('Found news item:', newsItem.id);
    console.log('Current titles:');
    console.log('  EN:', newsItem.title_en);
    console.log('  CN:', newsItem.title_cn);
    console.log('  MY:', newsItem.title_my);
    
    // Step 2: Trigger rewrite
    console.log('\nTriggering rewrite...');
    const rewriteOptions = {
      hostname: 'api-atap-solar-production.up.railway.app',
      path: `/news/${newsItem.id}/rewrite`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    };
    
    const rewriteResponse = await makeRequest(rewriteOptions);
    
    if (rewriteResponse.status !== 200) {
      console.error('Rewrite failed:', rewriteResponse);
      return;
    }
    
    console.log('Rewrite successful!');
    console.log('Rewrite response titles:');
    if (rewriteResponse.data.rewrite.titles) {
      console.log('  EN:', rewriteResponse.data.rewrite.titles.en);
      console.log('  CN:', rewriteResponse.data.rewrite.titles.zh_cn);
      console.log('  MY:', rewriteResponse.data.rewrite.titles.ms_my);
    }
    
    console.log('\nUpdated news titles:');
    console.log('  EN:', rewriteResponse.data.news.title_en);
    console.log('  CN:', rewriteResponse.data.news.title_cn);
    console.log('  MY:', rewriteResponse.data.news.title_my);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

console.log('Note: Make sure to set ADMIN_TOKEN environment variable before running');
testRewrite();
