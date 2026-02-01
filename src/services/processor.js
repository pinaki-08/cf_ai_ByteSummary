/**
 * Blog processing service - handles fetching and processing of all blog sources
 */

import { BLOG_SOURCES, BROWSER_HEADERS } from '../config/constants.js';
import { generateBlogId, extractArticleContent, extractTitle, detectCategory } from '../utils/content.js';
import { fetchBlogArticles } from './fetcher.js';
import { fetchGenericBlogArticles } from './genericFetcher.js';
import { generateBlogSummary } from './ai.js';
import { getAllUserCustomSources } from '../handlers/sources.js';

export async function updateJobStatus(env, status) {
  await env.SUMMARIES_CACHE.put('job:status', JSON.stringify({
    ...status,
    updatedAt: new Date().toISOString()
  }), { expirationTtl: 24 * 60 * 60 });
}

export async function fetchAndProcessBlogs(env) {
  console.log("Starting blog fetch...");
  
  const jobStatus = {
    status: 'running',
    message: 'Starting blog fetch...',
    startedAt: new Date().toISOString(),
    sources: {},
    totalArticles: 0,
    processedArticles: 0,
    errors: []
  };
  
  await updateJobStatus(env, jobStatus);
  
  const allSources = [...BLOG_SOURCES];
  
  const customSourcesList = await getAllUserCustomSources(env);
  for (const customSource of customSourcesList) {
    allSources.push({
      ...customSource,
      isCustom: true
    });
  }
  
  for (const source of allSources) {
    try {
      console.log(`Fetching from ${source.name}...`);
      jobStatus.message = `Fetching from ${source.name}...`;
      jobStatus.sources[source.id] = { 
        status: 'fetching', 
        articles: 0, 
        processed: 0,
        name: source.name,
        logo: source.logo,
        isCustom: source.isCustom || false
      };
      await updateJobStatus(env, jobStatus);
      
      const articles = source.isCustom 
        ? await fetchGenericBlogArticles(source)
        : await fetchBlogArticles(source);
      console.log(`Found ${articles.length} articles from ${source.name}`);
      
      jobStatus.sources[source.id].articles = articles.length;
      jobStatus.sources[source.id].status = 'processing';
      jobStatus.totalArticles += Math.min(articles.length, 5);
      await updateJobStatus(env, jobStatus);
      
      for (const article of articles.slice(0, 5)) {
        try {
          jobStatus.message = `Processing: ${article.title?.slice(0, 50) || article.url}...`;
          await updateJobStatus(env, jobStatus);
          
          await processArticle(article, source, env);
          
          jobStatus.sources[source.id].processed++;
          jobStatus.processedArticles++;
          await updateJobStatus(env, jobStatus);
        } catch (err) {
          console.error(`Error processing article ${article.url}:`, err);
          jobStatus.errors.push({ source: source.id, url: article.url, error: err.message });
        }
      }
      
      jobStatus.sources[source.id].status = 'completed';
      await updateJobStatus(env, jobStatus);
    } catch (err) {
      console.error(`Error fetching from ${source.name}:`, err);
      jobStatus.sources[source.id] = { 
        ...jobStatus.sources[source.id],
        status: 'error', 
        error: err.message,
        name: source.name,
        logo: source.logo,
        isCustom: source.isCustom || false
      };
      jobStatus.errors.push({ source: source.id, error: err.message });
      await updateJobStatus(env, jobStatus);
    }
  }
  
  jobStatus.status = 'completed';
  jobStatus.message = `Completed! Processed ${jobStatus.processedArticles} articles.`;
  jobStatus.completedAt = new Date().toISOString();
  await updateJobStatus(env, jobStatus);
  
  console.log("Blog fetch complete!");
}

async function processArticle(article, source, env) {
  const blogId = generateBlogId(article.url);
  
  const existing = await env.SUMMARIES_CACHE.get(`blog:${blogId}`);
  if (existing) {
    console.log(`Article already processed: ${article.url}`);
    const blogEntry = JSON.parse(existing);
    await addToIndex(blogEntry, source, env);
    return;
  }
  
  const response = await fetch(article.url, { 
    headers: BROWSER_HEADERS,
    redirect: 'follow'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch article: ${response.status}`);
  }
  
  const html = await response.text();
  const content = extractArticleContent(html);
  
  if (!content || content.length < 200) {
    console.log(`Insufficient content for: ${article.url}`);
    return;
  }
  
  const summary = await generateBlogSummary(article.title || extractTitle(html), content, env);
  const category = detectCategory(content, article.title || '');
  
  const blogEntry = {
    id: blogId,
    source: source.id,
    sourceName: source.name,
    sourceLogo: source.logo,
    sourceColor: source.color,
    url: article.url,
    title: article.title || extractTitle(html) || 'Untitled',
    category,
    summary: summary.brief,
    fullSummary: summary.detailed,
    keyPoints: summary.keyPoints,
    technologies: summary.technologies,
    fetchedAt: new Date().toISOString(),
    contentLength: content.length
  };
  
  await env.SUMMARIES_CACHE.put(`blog:${blogId}`, JSON.stringify(blogEntry), {
    expirationTtl: 30 * 24 * 60 * 60
  });
  
  await addToIndex(blogEntry, source, env);
  
  console.log(`Processed: ${blogEntry.title}`);
}

async function addToIndex(blogEntry, source, env) {
  const indexData = await env.SUMMARIES_CACHE.get('blogs:index');
  let index = indexData ? JSON.parse(indexData) : [];
  
  if (!index.some(b => b.id === blogEntry.id)) {
    index.unshift({
      id: blogEntry.id,
      source: source.id,
      sourceName: source.name,
      sourceLogo: source.logo,
      title: blogEntry.title,
      category: blogEntry.category,
      summary: blogEntry.summary,
      technologies: blogEntry.technologies || [],
      fetchedAt: blogEntry.fetchedAt
    });
    
    index = index.slice(0, 100);
    
    await env.SUMMARIES_CACHE.put('blogs:index', JSON.stringify(index), {
      expirationTtl: 30 * 24 * 60 * 60
    });
  }
}
