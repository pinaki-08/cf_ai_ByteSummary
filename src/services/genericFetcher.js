/**
 * Generic blog fetcher for custom sources
 */

import { SKIP_PATTERNS } from '../config/constants.js';
import { slugToTitle } from '../utils/content.js';

const CUSTOM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none'
};

export async function fetchGenericBlogArticles(source) {
  let response;
  try {
    response = await fetch(source.url, { 
      headers: CUSTOM_HEADERS,
      redirect: 'follow'
    });
  } catch (err) {
    console.error(`Network error fetching ${source.url}:`, err);
    throw new Error(`Network error: ${err.message}`);
  }
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: Failed to fetch ${source.url}`);
  }
  
  const html = await response.text();
  const articles = [];
  
  const finalUrl = response.url || source.url;
  let baseUrl;
  try {
    baseUrl = new URL(finalUrl);
  } catch {
    baseUrl = new URL(source.url);
  }
  
  console.log(`Fetching custom source: ${source.name}, Final URL: ${finalUrl}, HTML length: ${html.length}`);
  
  const isMedium = baseUrl.hostname.includes('medium.com') || 
                   html.includes('medium.com') ||
                   html.includes('data-post-id');
  
  if (isMedium) {
    parseMediumArticles(html, baseUrl, articles);
  }
  
  parseGenericArticles(html, baseUrl, finalUrl, isMedium, articles);
  
  console.log(`${source.name} (custom): Found ${articles.length} articles`);
  return articles.slice(0, 20);
}

function parseMediumArticles(html, baseUrl, articles) {
  console.log(`Detected Medium blog`);
  
  // Pattern 1: Medium UUID links
  const mediumMatches = html.matchAll(/href="(https?:\/\/[^"]*\/[a-z0-9-]+-[a-f0-9]{10,})"[^>]*>/gi);
  for (const match of mediumMatches) {
    const url = match[1];
    try {
      const articleUrl = new URL(url);
      const pathParts = articleUrl.pathname.split('/').filter(Boolean);
      const lastPart = pathParts[pathParts.length - 1] || '';
      const slug = lastPart.replace(/-[a-f0-9]{10,}$/i, '');
      if (slug && slug.length > 5 && !articles.some(a => a.url === url)) {
        articles.push({ url, title: slugToTitle(slug) });
      }
    } catch { continue; }
  }
  
  // Pattern 2: h2/h3 with links
  const titleMatches = html.matchAll(/<h[23][^>]*>.*?<a[^>]*href="([^"]+)"[^>]*>([^<]{10,200})<\/a>/gis);
  for (const match of titleMatches) {
    let url = match[1];
    const title = match[2].trim().replace(/\s+/g, ' ');
    
    if (url.startsWith('/')) {
      url = `${baseUrl.origin}${url}`;
    }
    
    if (title.length >= 10 && !articles.some(a => a.url === url)) {
      articles.push({ url, title });
    }
  }
  
  // Pattern 3: data-href attributes
  const dataMatches = html.matchAll(/data-href="([^"]+)"[^>]*>([^<]{15,})</gi);
  for (const match of dataMatches) {
    let url = match[1];
    const title = match[2].trim().replace(/\s+/g, ' ');
    
    if (url.startsWith('/')) {
      url = `${baseUrl.origin}${url}`;
    }
    
    if (!articles.some(a => a.url === url)) {
      articles.push({ url, title });
    }
  }
}

function parseGenericArticles(html, baseUrl, finalUrl, isMedium, articles) {
  // Pattern 1: Headings with links
  const headingMatches = html.matchAll(/<(?:h[1-3])[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]{15,200})<\/a>/gi);
  for (const match of headingMatches) {
    let url = match[1];
    const title = match[2].trim().replace(/\s+/g, ' ');
    
    if (url.startsWith('#') || url.startsWith('javascript:')) continue;
    
    if (url.startsWith('/')) {
      url = `${baseUrl.origin}${url}`;
    } else if (!url.startsWith('http')) {
      try {
        url = new URL(url, finalUrl).href;
      } catch { continue; }
    }
    
    try {
      const articleUrl = new URL(url);
      const sameDomain = articleUrl.hostname === baseUrl.hostname ||
                         articleUrl.hostname.endsWith('.medium.com');
      if (!sameDomain) continue;
    } catch { continue; }
    
    const urlLower = url.toLowerCase();
    if (SKIP_PATTERNS.some(p => urlLower.includes(`/${p}/`) || urlLower.includes(`/${p}?`) || urlLower.endsWith(`/${p}`))) continue;
    
    if (title.length >= 15 && !articles.some(a => a.url === url)) {
      articles.push({ url: url.replace(/\/$/, ''), title });
    }
  }
  
  // Pattern 2: Article class links
  const articleLinkMatches = html.matchAll(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*(?:post|article|entry|story)[^"]*"[^>]*>([^<]{10,})</gi);
  for (const match of articleLinkMatches) {
    let url = match[1];
    const title = match[2].trim().replace(/\s+/g, ' ');
    
    if (url.startsWith('/')) {
      url = `${baseUrl.origin}${url}`;
    } else if (!url.startsWith('http')) {
      try { url = new URL(url, finalUrl).href; } catch { continue; }
    }
    
    if (title.length >= 10 && !articles.some(a => a.url === url)) {
      articles.push({ url: url.replace(/\/$/, ''), title });
    }
  }
  
  // Pattern 3: Slug-based links
  const linkMatches = html.matchAll(/href="([^"]+)"/gi);
  for (const match of linkMatches) {
    let url = match[1];
    
    if (url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('mailto:')) continue;
    
    if (url.startsWith('/')) {
      url = `${baseUrl.origin}${url}`;
    } else if (!url.startsWith('http')) {
      try {
        url = new URL(url, finalUrl).href;
      } catch { continue; }
    }
    
    try {
      const articleUrl = new URL(url);
      const sameDomain = articleUrl.hostname === baseUrl.hostname ||
                         (isMedium && articleUrl.hostname.endsWith('.medium.com'));
      if (!sameDomain) continue;
      
      const pathParts = articleUrl.pathname.split('/').filter(Boolean);
      if (pathParts.length === 0) continue;
      
      const slug = pathParts[pathParts.length - 1];
      
      if (slug.length < 8 || SKIP_PATTERNS.includes(slug.toLowerCase())) continue;
      
      const looksLikeArticle = slug.includes('-') || /[a-f0-9]{10,}$/i.test(slug);
      if (!looksLikeArticle || /^\d+$/.test(slug)) continue;
      
      const normalizedUrl = url.replace(/\/$/, '');
      if (!articles.some(a => a.url === normalizedUrl)) {
        const cleanSlug = slug.replace(/-[a-f0-9]{10,}$/i, '');
        const title = slugToTitle(cleanSlug);
        if (title.length >= 5) {
          articles.push({ url: normalizedUrl, title });
        }
      }
    } catch { continue; }
  }
}
