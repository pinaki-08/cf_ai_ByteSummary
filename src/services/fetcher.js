/**
 * Blog fetching service - fetches articles from built-in sources
 */

import { BROWSER_HEADERS } from '../config/constants.js';
import { slugToTitle } from '../utils/content.js';

export async function fetchBlogArticles(source) {
  const response = await fetch(source.url, { 
    headers: BROWSER_HEADERS,
    redirect: 'follow'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${source.url}: ${response.status}`);
  }
  
  const html = await response.text();
  const articles = [];
  
  if (source.id === 'meta') {
    parseMetaArticles(html, articles);
  } else if (source.id === 'uber') {
    parseUberArticles(html, articles);
  } else if (source.id === 'cloudflare') {
    parseCloudflareArticles(html, articles);
  } else if (source.id === 'microsoft') {
    parseMicrosoftArticles(html, articles);
  }
  
  return articles;
}

function parseMetaArticles(html, articles) {
  const articleMatches = html.matchAll(/<a[^>]*href="(https:\/\/engineering\.fb\.com\/\d{4}\/\d{2}\/\d{2}\/[^"]+)"[^>]*>([^<]*)<\/a>/gi);
  for (const match of articleMatches) {
    const url = match[1];
    const title = match[2].trim();
    if (title && !articles.some(a => a.url === url)) {
      articles.push({ url, title });
    }
  }
  
  const titleMatches = html.matchAll(/<h[23][^>]*>.*?<a[^>]*href="(https:\/\/engineering\.fb\.com\/[^"]+)"[^>]*>([^<]+)<\/a>/gis);
  for (const match of titleMatches) {
    const url = match[1];
    const title = match[2].trim();
    if (title && !articles.some(a => a.url === url)) {
      articles.push({ url, title });
    }
  }
}

function parseUberArticles(html, articles) {
  const skipPatterns = ['/engineering', '/advertising', '/earn', '/ride', '/eat', '/merchants', 
                       '/business', '/freight', '/health', '/higher-education', '/transit',
                       '/careers', '/community-support', '/research', '/category', '/tag'];
  
  const relativeMatches = html.matchAll(/href="(\/blog\/[a-z0-9-]+\/?)"[^>]*>/gi);
  for (const match of relativeMatches) {
    const path = match[1].replace(/\/$/, '');
    const slug = path.replace('/blog/', '');
    
    if (skipPatterns.some(p => path.includes(p)) || slug.length < 5) continue;
    
    const url = `https://www.uber.com${path}/`;
    if (!articles.some(a => a.url === url)) {
      articles.push({ url, title: slugToTitle(slug) });
    }
  }
  
  const fullUrlMatches = html.matchAll(/href="(https:\/\/www\.uber\.com\/(?:en-[A-Z]{2}\/)?blog\/[a-z0-9-]+\/?)"[^>]*>/gi);
  for (const match of fullUrlMatches) {
    let url = match[1].replace(/\/$/, '') + '/';
    url = url.replace(/\/en-[A-Z]{2}\/blog\//, '/blog/');
    const slug = url.match(/\/blog\/([^/]+)/)?.[1];
    
    if (!slug || slug.length < 5) continue;
    if (skipPatterns.some(p => url.includes(p))) continue;
    
    if (!articles.some(a => a.url === url)) {
      articles.push({ url, title: slugToTitle(slug) });
    }
  }
  
  console.log(`Uber: Found ${articles.length} articles`);
}

function parseCloudflareArticles(html, articles) {
  const skipSlugs = ['tag', 'author', 'page', 'category', 'search', 'about', 'contact', 'rss', 'feed', 'cdn-cgi'];
  const langPattern = /^[a-z]{2}-[a-z]{2}$/;
  
  const relativeMatches = html.matchAll(/href="\/(([a-z0-9])[a-z0-9-]+)\/?"/gi);
  for (const match of relativeMatches) {
    const slug = match[1];
    
    if (!slug || slug.length < 8 || skipSlugs.includes(slug)) continue;
    if (langPattern.test(slug)) continue;
    
    const url = `https://blog.cloudflare.com/${slug}/`;
    if (!articles.some(a => a.url === url)) {
      articles.push({ url, title: slugToTitle(slug) });
    }
  }
  
  const fullMatches = html.matchAll(/href="(https:\/\/blog\.cloudflare\.com\/([a-z0-9][a-z0-9-]+)\/?)"[^>]*>/gi);
  for (const match of fullMatches) {
    const url = match[1].replace(/\/$/, '') + '/';
    const slug = match[2];
    
    if (!slug || slug.length < 8 || skipSlugs.includes(slug)) continue;
    if (langPattern.test(slug)) continue;
    
    if (!articles.some(a => a.url === url)) {
      articles.push({ url, title: slugToTitle(slug) });
    }
  }
  
  console.log(`Cloudflare: Found ${articles.length} articles`);
}

function parseMicrosoftArticles(html, articles) {
  const skipSlugs = ['tag', 'author', 'page', 'category', 'search', 'about', 'contact', 'feed', 'archive'];
  
  const articleMatches = html.matchAll(/href="(https:\/\/devblogs\.microsoft\.com\/engineering-at-microsoft\/[a-z0-9-]+\/?)"[^>]*>/gi);
  for (const match of articleMatches) {
    const url = match[1].replace(/\/$/, '') + '/';
    const slug = url.match(/engineering-at-microsoft\/([^/]+)/)?.[1];
    
    if (!slug || slug.length < 5 || skipSlugs.includes(slug)) continue;
    
    if (!articles.some(a => a.url === url)) {
      articles.push({ url, title: slugToTitle(slug) });
    }
  }
  
  const otherMatches = html.matchAll(/href="(https:\/\/devblogs\.microsoft\.com\/([a-z0-9-]+)\/([a-z0-9-]+)\/?)"[^>]*>/gi);
  for (const match of otherMatches) {
    const url = match[1].replace(/\/$/, '') + '/';
    const category = match[2];
    const slug = match[3];
    
    const skipCategories = ['tag', 'author', 'page', 'category', 'search', 'feed', 'landingpage'];
    if (skipCategories.includes(category) || skipSlugs.includes(slug) || slug.length < 5) continue;
    
    if (!articles.some(a => a.url === url)) {
      articles.push({ url, title: slugToTitle(slug) });
    }
  }
  
  const titleMatches = html.matchAll(/<a[^>]*href="(https:\/\/devblogs\.microsoft\.com\/[^"]+\/[^"]+)"[^>]*>([^<]{15,150})<\/a>/gi);
  for (const match of titleMatches) {
    const url = match[1].replace(/\/$/, '') + '/';
    const title = match[2].trim();
    
    if (url.includes('?') || url.includes('#')) continue;
    if (title.length < 15) continue;
    
    if (title && !articles.some(a => a.url === url)) {
      articles.push({ url, title });
    }
  }
  
  console.log(`Microsoft: Found ${articles.length} articles`);
}
