const { PrismaClient } = require('@prisma/client');
const { rewriteNews } = require('./dist-api/api/services/rewriterService.js');

const prisma = new PrismaClient();

async function testRewrite() {
  try {
    // Find an existing news item
    let news = await prisma.news.findFirst({
      include: {
        category: { include: { tags: true } }
      }
    });
    
    if (!news) {
      // Create a test news item if none exists
      console.log('Creating test news item...');
      const newNews = await prisma.news.create({
        data: {
          title_en: 'Test Solar News Headline',
          title_cn: 'Test Solar News Headline',
          title_my: 'Test Solar News Headline',
          content_en: 'Pending rewrite for: Test Solar News Headline',
          content_cn: 'Pending rewrite for: Test Solar News Headline',
          content_my: 'Pending rewrite for: Test Solar News Headline',
          news_date: new Date(),
          is_published: false,
          is_highlight: false
        }
      });
      console.log('Created news:', newNews.id);
      news = newNews;
    }
    
    console.log('Testing rewrite for news:', news.id);
    console.log('Before rewrite:');
    console.log('  EN title:', news.title_en);
    console.log('  CN title:', news.title_cn);
    console.log('  MY title:', news.title_my);
    
    // Run rewrite
    const result = await rewriteNews(news.id);
    
    console.log('\nAfter rewrite:');
    console.log('  EN title:', result.updatedNews.title_en);
    console.log('  CN title:', result.updatedNews.title_cn);
    console.log('  MY title:', result.updatedNews.title_my);
    
    console.log('\nRewrite response titles:');
    if (result.rewrite.titles) {
      console.log('  EN:', result.rewrite.titles.en);
      console.log('  CN:', result.rewrite.titles.zh_cn);
      console.log('  MY:', result.rewrite.titles.ms_my);
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
  }
}

testRewrite();
