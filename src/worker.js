/**
 * ByteSummary - AI-Powered Tech Blog Aggregator
 * Cloudflare Worker with Workers AI (Llama 3.3) integration
 * Automatically fetches and summarizes tech blogs from major companies
 */

// Blog sources configuration
const BLOG_SOURCES = [
  {
    id: 'meta',
    name: 'Meta Engineering',
    url: 'https://engineering.fb.com/',
    logo: '🔵',
    color: '#0668E1'
  },
  {
    id: 'uber',
    name: 'Uber Engineering',
    url: 'https://www.uber.com/en-US/blog/engineering/',
    logo: '⚫',
    color: '#000000'
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Engineering',
    url: 'https://blog.cloudflare.com/',
    logo: '🟠',
    color: '#F6821F'
  },
  {
    id: 'microsoft',
    name: 'Microsoft DevBlogs',
    url: 'https://devblogs.microsoft.com/engineering-at-microsoft/',
    logo: '🟦',
    color: '#0078D4'
  }
];

const CATEGORIES = [
  { id: 'all', name: 'All Topics', icon: '📚' },
  { id: 'ml', name: 'Machine Learning', icon: '🤖' },
  { id: 'engineering', name: 'Engineering', icon: '⚙️' },
  { id: 'infrastructure', name: 'Infrastructure', icon: '🏗️' },
  { id: 'data', name: 'Data', icon: '📊' },
  { id: 'mobile', name: 'Mobile', icon: '📱' },
  { id: 'web', name: 'Web', icon: '🌐' }
];

const COOKIE_NAME = "bytesummary_session";
const SESSION_EXPIRY = 7 * 24 * 60 * 60;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (request.method === "OPTIONS") {
      return handleCORS();
    }

    // Auth Routes
    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      return handleRegister(request, env);
    }
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      return handleLogin(request, env);
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      return handleLogout();
    }
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      return handleGetCurrentUser(request, env);
    }

    // Blog API Routes
    if (url.pathname === "/api/blogs" && request.method === "GET") {
      return handleGetBlogs(request, env);
    }
    if (url.pathname === "/api/blogs/sources" && request.method === "GET") {
      return handleGetSources();
    }
    if (url.pathname === "/api/blogs/categories" && request.method === "GET") {
      return handleGetCategories();
    }
    if (url.pathname.match(/^\/api\/blogs\/[^/]+$/) && request.method === "GET") {
      const blogId = url.pathname.split("/api/blogs/")[1];
      return handleGetBlogDetail(blogId, env);
    }

    // Manual refresh endpoint
    if (url.pathname === "/api/refresh" && request.method === "POST") {
      ctx.waitUntil(fetchAndProcessBlogs(env));
      return jsonResponse({ success: true, message: 'Blog refresh started in background' });
    }

    // Job status endpoint
    if (url.pathname === "/api/job-status" && request.method === "GET") {
      return handleGetJobStatus(env);
    }

    // Clear cache endpoint
    if (url.pathname === "/api/clear-cache" && request.method === "POST") {
      return handleClearCache(env);
    }

    return env.ASSETS.fetch(request);
  },

  // Scheduled task - runs daily
  async scheduled(event, env, ctx) {
    ctx.waitUntil(fetchAndProcessBlogs(env));
  }
};

// ==================== CORS HELPERS ====================

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function handleCORS() {
  return new Response(null, { headers: corsHeaders() });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders()
  });
}

// ==================== AUTH HANDLERS ====================

async function handleRegister(request, env) {
  try {
    const { email, password, name } = await request.json();
    
    if (!email || !password || !name) {
      return jsonResponse({ error: "Email, password, and name are required" }, 400);
    }
    
    const existingUser = await env.SUMMARIES_CACHE.get(`user:${email}`);
    if (existingUser) {
      return jsonResponse({ error: "User already exists" }, 400);
    }
    
    const userId = crypto.randomUUID();
    const user = {
      id: userId,
      email,
      name,
      password: await hashPassword(password),
      createdAt: new Date().toISOString()
    };
    
    await env.SUMMARIES_CACHE.put(`user:${email}`, JSON.stringify(user));
    
    const sessionId = crypto.randomUUID();
    await env.SUMMARIES_CACHE.put(`session:${sessionId}`, JSON.stringify({
      userId,
      email,
      name
    }), { expirationTtl: SESSION_EXPIRY });
    
    const response = jsonResponse({ success: true, user: { email, name } });
    response.headers.set("Set-Cookie", `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_EXPIRY}`);
    return response;
  } catch (error) {
    return jsonResponse({ error: "Registration failed" }, 500);
  }
}

async function handleLogin(request, env) {
  try {
    const { email, password } = await request.json();
    
    const userData = await env.SUMMARIES_CACHE.get(`user:${email}`);
    if (!userData) {
      return jsonResponse({ error: "Invalid credentials" }, 401);
    }
    
    const user = JSON.parse(userData);
    const isValid = await verifyPassword(password, user.password);
    
    if (!isValid) {
      return jsonResponse({ error: "Invalid credentials" }, 401);
    }
    
    const sessionId = crypto.randomUUID();
    await env.SUMMARIES_CACHE.put(`session:${sessionId}`, JSON.stringify({
      userId: user.id,
      email: user.email,
      name: user.name
    }), { expirationTtl: SESSION_EXPIRY });
    
    const response = jsonResponse({ success: true, user: { email: user.email, name: user.name } });
    response.headers.set("Set-Cookie", `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_EXPIRY}`);
    return response;
  } catch (error) {
    return jsonResponse({ error: "Login failed" }, 500);
  }
}

function handleLogout() {
  const response = jsonResponse({ success: true });
  response.headers.set("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  return response;
}

async function handleGetCurrentUser(request, env) {
  const sessionId = getSessionFromCookie(request);
  if (!sessionId) {
    return jsonResponse({ user: null });
  }
  
  const sessionData = await env.SUMMARIES_CACHE.get(`session:${sessionId}`);
  if (!sessionData) {
    return jsonResponse({ user: null });
  }
  
  const session = JSON.parse(sessionData);
  return jsonResponse({ user: { email: session.email, name: session.name } });
}

function getSessionFromCookie(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "bytesummary_salt_v1");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

async function verifyPassword(password, hash) {
  const newHash = await hashPassword(password);
  return newHash === hash;
}

// ==================== BLOG API HANDLERS ====================

async function handleGetBlogs(request, env) {
  const url = new URL(request.url);
  const source = url.searchParams.get('source') || 'all';
  const category = url.searchParams.get('category') || 'all';
  const days = parseInt(url.searchParams.get('days') || '30');
  
  // Get blog index
  const indexData = await env.SUMMARIES_CACHE.get('blogs:index');
  let blogs = indexData ? JSON.parse(indexData) : [];
  
  // Apply filters
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  blogs = blogs.filter(blog => {
    if (source !== 'all' && blog.source !== source) return false;
    if (category !== 'all' && blog.category !== category) return false;
    if (new Date(blog.fetchedAt) < cutoffDate) return false;
    return true;
  });
  
  // Sort by date, newest first
  blogs.sort((a, b) => new Date(b.fetchedAt) - new Date(a.fetchedAt));
  
  return jsonResponse({ blogs, total: blogs.length });
}

function handleGetSources() {
  return jsonResponse({ sources: BLOG_SOURCES });
}

function handleGetCategories() {
  return jsonResponse({ categories: CATEGORIES });
}

async function handleGetBlogDetail(blogId, env) {
  const blogData = await env.SUMMARIES_CACHE.get(`blog:${blogId}`);
  if (!blogData) {
    return jsonResponse({ error: "Blog not found" }, 404);
  }
  return jsonResponse({ blog: JSON.parse(blogData) });
}

async function handleGetJobStatus(env) {
  const statusData = await env.SUMMARIES_CACHE.get('job:status');
  if (!statusData) {
    return jsonResponse({ 
      status: 'idle', 
      message: 'No job has been run yet',
      lastRun: null 
    });
  }
  return jsonResponse(JSON.parse(statusData));
}

async function handleClearCache(env) {
  try {
    // Clear the blog index
    await env.SUMMARIES_CACHE.delete('blogs:index');
    await env.SUMMARIES_CACHE.delete('job:status');
    
    // List and delete all blog entries
    const listResult = await env.SUMMARIES_CACHE.list({ prefix: 'blog:' });
    for (const key of listResult.keys) {
      await env.SUMMARIES_CACHE.delete(key.name);
    }
    
    return jsonResponse({ 
      success: true, 
      message: `Cache cleared (${listResult.keys.length} entries). Click "Fetch Latest Blogs" to refetch.` 
    });
  } catch (error) {
    console.error('Clear cache error:', error);
    return jsonResponse({ error: 'Failed to clear cache' }, 500);
  }
}

// ==================== BLOG FETCHING & PROCESSING ====================

async function updateJobStatus(env, status) {
  await env.SUMMARIES_CACHE.put('job:status', JSON.stringify({
    ...status,
    updatedAt: new Date().toISOString()
  }), { expirationTtl: 24 * 60 * 60 }); // 24 hour TTL
}

async function fetchAndProcessBlogs(env) {
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
  
  for (const source of BLOG_SOURCES) {
    try {
      console.log(`Fetching from ${source.name}...`);
      jobStatus.message = `Fetching from ${source.name}...`;
      jobStatus.sources[source.id] = { status: 'fetching', articles: 0, processed: 0 };
      await updateJobStatus(env, jobStatus);
      
      const articles = await fetchBlogArticles(source);
      console.log(`Found ${articles.length} articles from ${source.name}`);
      
      jobStatus.sources[source.id].articles = articles.length;
      jobStatus.sources[source.id].status = 'processing';
      jobStatus.totalArticles += Math.min(articles.length, 5);
      await updateJobStatus(env, jobStatus);
      
      for (const article of articles.slice(0, 5)) { // Process top 5 per source
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
      jobStatus.sources[source.id] = { status: 'error', error: err.message };
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

async function fetchBlogArticles(source) {
  // Use full browser headers to avoid bot detection
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  };
  
  const response = await fetch(source.url, { 
    headers,
    redirect: 'follow'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${source.url}: ${response.status}`);
  }
  
  const html = await response.text();
  const articles = [];
  
  if (source.id === 'meta') {
    // Parse Meta Engineering blog
    const articleMatches = html.matchAll(/<a[^>]*href="(https:\/\/engineering\.fb\.com\/\d{4}\/\d{2}\/\d{2}\/[^"]+)"[^>]*>([^<]*)<\/a>/gi);
    for (const match of articleMatches) {
      const url = match[1];
      const title = match[2].trim();
      if (title && !articles.some(a => a.url === url)) {
        articles.push({ url, title });
      }
    }
    
    // Also try to find article titles in different patterns
    const titleMatches = html.matchAll(/<h[23][^>]*>.*?<a[^>]*href="(https:\/\/engineering\.fb\.com\/[^"]+)"[^>]*>([^<]+)<\/a>/gis);
    for (const match of titleMatches) {
      const url = match[1];
      const title = match[2].trim();
      if (title && !articles.some(a => a.url === url)) {
        articles.push({ url, title });
      }
    }
  } else if (source.id === 'uber') {
    // Parse Uber Engineering blog - look for relative blog article links
    // Uber uses relative URLs like /blog/article-name/
    const skipPatterns = ['/engineering', '/advertising', '/earn', '/ride', '/eat', '/merchants', 
                         '/business', '/freight', '/health', '/higher-education', '/transit',
                         '/careers', '/community-support', '/research', '/category', '/tag'];
    
    // Pattern 1: Relative URLs /blog/article-slug/
    const relativeMatches = html.matchAll(/href="(\/blog\/[a-z0-9-]+\/?)"[^>]*>/gi);
    for (const match of relativeMatches) {
      const path = match[1].replace(/\/$/, '');
      const slug = path.replace('/blog/', '');
      
      // Skip non-article pages
      if (skipPatterns.some(p => path.includes(p)) || slug.length < 5) continue;
      
      const url = `https://www.uber.com${path}/`;
      if (!articles.some(a => a.url === url)) {
        // Convert slug to title
        const title = slug.split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        articles.push({ url, title });
      }
    }
    
    // Pattern 2: Full URLs with en-US or other locale
    const fullUrlMatches = html.matchAll(/href="(https:\/\/www\.uber\.com\/(?:en-[A-Z]{2}\/)?blog\/[a-z0-9-]+\/?)"[^>]*>/gi);
    for (const match of fullUrlMatches) {
      let url = match[1].replace(/\/$/, '') + '/';
      // Normalize to non-locale URL
      url = url.replace(/\/en-[A-Z]{2}\/blog\//, '/blog/');
      const slug = url.match(/\/blog\/([^/]+)/)?.[1];
      
      if (!slug || slug.length < 5) continue;
      if (skipPatterns.some(p => url.includes(p))) continue;
      
      if (!articles.some(a => a.url === url)) {
        const title = slug.split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        articles.push({ url, title });
      }
    }
    
    console.log(`Uber: Found ${articles.length} articles`);
  } else if (source.id === 'cloudflare') {
    // Parse Cloudflare Blog - look for relative URLs like /article-slug/
    const skipSlugs = ['tag', 'author', 'page', 'category', 'search', 'about', 'contact', 'rss', 'feed', 'cdn-cgi'];
    // Language code patterns to skip (e.g., de-de, es-es, fr-fr)
    const langPattern = /^[a-z]{2}-[a-z]{2}$/;
    
    // Pattern 1: Relative URLs /article-slug/
    const relativeMatches = html.matchAll(/href="\/(([a-z0-9])[a-z0-9-]+)\/?"/gi);
    for (const match of relativeMatches) {
      const slug = match[1];
      
      // Skip language pages, short slugs, and navigation pages
      if (!slug || slug.length < 8 || skipSlugs.includes(slug)) continue;
      if (langPattern.test(slug)) continue;
      
      const url = `https://blog.cloudflare.com/${slug}/`;
      if (!articles.some(a => a.url === url)) {
        const title = slug.split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        articles.push({ url, title });
      }
    }
    
    // Pattern 2: Full URLs
    const fullMatches = html.matchAll(/href="(https:\/\/blog\.cloudflare\.com\/([a-z0-9][a-z0-9-]+)\/?)"[^>]*>/gi);
    for (const match of fullMatches) {
      const url = match[1].replace(/\/$/, '') + '/';
      const slug = match[2];
      
      if (!slug || slug.length < 8 || skipSlugs.includes(slug)) continue;
      if (langPattern.test(slug)) continue;
      
      if (!articles.some(a => a.url === url)) {
        const title = slug.split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        articles.push({ url, title });
      }
    }
    
    console.log(`Cloudflare: Found ${articles.length} articles`);
  } else if (source.id === 'microsoft') {
    // Parse Microsoft Engineering at Microsoft DevBlogs
    const skipSlugs = ['tag', 'author', 'page', 'category', 'search', 'about', 'contact', 'feed', 'archive'];
    
    // Look for article links - engineering-at-microsoft/article-slug pattern
    const articleMatches = html.matchAll(/href="(https:\/\/devblogs\.microsoft\.com\/engineering-at-microsoft\/[a-z0-9-]+\/?)"[^>]*>/gi);
    for (const match of articleMatches) {
      const url = match[1].replace(/\/$/, '') + '/';
      const slug = url.match(/engineering-at-microsoft\/([^/]+)/)?.[1];
      
      if (!slug || slug.length < 5 || skipSlugs.includes(slug)) continue;
      
      if (!articles.some(a => a.url === url)) {
        const title = slug.split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        articles.push({ url, title });
      }
    }
    
    // Also look for other devblogs sections (dotnet, typescript, etc.)
    const otherMatches = html.matchAll(/href="(https:\/\/devblogs\.microsoft\.com\/([a-z0-9-]+)\/([a-z0-9-]+)\/?)"[^>]*>/gi);
    for (const match of otherMatches) {
      const url = match[1].replace(/\/$/, '') + '/';
      const category = match[2];
      const slug = match[3];
      
      // Skip navigation/meta pages
      const skipCategories = ['tag', 'author', 'page', 'category', 'search', 'feed', 'landingpage'];
      if (skipCategories.includes(category) || skipSlugs.includes(slug) || slug.length < 5) continue;
      
      if (!articles.some(a => a.url === url)) {
        const title = slug.split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        articles.push({ url, title });
      }
    }
    
    // Extract titles from headings with links
    const titleMatches = html.matchAll(/<a[^>]*href="(https:\/\/devblogs\.microsoft\.com\/[^"]+\/[^"]+)"[^>]*>([^<]{15,150})<\/a>/gi);
    for (const match of titleMatches) {
      const url = match[1].replace(/\/$/, '') + '/';
      const title = match[2].trim();
      
      // Skip URLs with query params or anchors
      if (url.includes('?') || url.includes('#')) continue;
      if (title.length < 15) continue;
      
      if (title && !articles.some(a => a.url === url)) {
        articles.push({ url, title });
      }
    }
    
    console.log(`Microsoft: Found ${articles.length} articles`);
  }
  
  return articles;
}

async function processArticle(article, source, env) {
  const blogId = generateBlogId(article.url);
  
  // Check if already processed
  const existing = await env.SUMMARIES_CACHE.get(`blog:${blogId}`);
  if (existing) {
    console.log(`Article already processed: ${article.url}`);
    // Still need to ensure it's in the index (in case index was cleared)
    const blogEntry = JSON.parse(existing);
    await addToIndex(blogEntry, source, env);
    return;
  }
  
  // Fetch article content with full browser headers
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
  };
  
  const response = await fetch(article.url, { 
    headers,
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
  
  // Generate AI summary
  const summary = await generateBlogSummary(article.title || extractTitle(html), content, env);
  
  // Detect category
  const category = detectCategory(content, article.title || '');
  
  // Create blog entry
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
  
  // Store blog entry
  await env.SUMMARIES_CACHE.put(`blog:${blogId}`, JSON.stringify(blogEntry), {
    expirationTtl: 30 * 24 * 60 * 60 // 30 days
  });
  
  // Update index
  await addToIndex(blogEntry, source, env);
  
  console.log(`Processed: ${blogEntry.title}`);
}

// Helper function to add a blog entry to the index
async function addToIndex(blogEntry, source, env) {
  const indexData = await env.SUMMARIES_CACHE.get('blogs:index');
  let index = indexData ? JSON.parse(indexData) : [];
  
  // Add to index if not already there
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
    
    // Keep only last 100 entries in index
    index = index.slice(0, 100);
    
    await env.SUMMARIES_CACHE.put('blogs:index', JSON.stringify(index), {
      expirationTtl: 30 * 24 * 60 * 60
    });
  }
}

function generateBlogId(url) {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data[i];
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function extractArticleContent(html) {
  // Remove scripts, styles, and HTML tags
  let content = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Limit content length for API
  return content.slice(0, 8000);
}

function extractTitle(html) {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

function detectCategory(content, title) {
  const text = (content + ' ' + title).toLowerCase();
  
  const categoryKeywords = {
    ml: ['machine learning', 'ml', 'ai', 'artificial intelligence', 'neural network', 'deep learning', 'model', 'training', 'inference', 'pytorch', 'tensorflow', 'llm', 'gpt', 'transformer'],
    infrastructure: ['infrastructure', 'kubernetes', 'k8s', 'docker', 'container', 'cloud', 'aws', 'gcp', 'azure', 'serverless', 'microservices', 'scalability', 'reliability'],
    data: ['data', 'database', 'sql', 'nosql', 'analytics', 'pipeline', 'etl', 'warehouse', 'lake', 'streaming', 'kafka', 'spark', 'hadoop'],
    mobile: ['mobile', 'ios', 'android', 'swift', 'kotlin', 'react native', 'flutter', 'app'],
    web: ['web', 'frontend', 'react', 'javascript', 'typescript', 'css', 'html', 'browser', 'performance', 'ui', 'ux']
  };
  
  let maxScore = 0;
  let detectedCategory = 'engineering';
  
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        score++;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      detectedCategory = category;
    }
  }
  
  return detectedCategory;
}

async function generateBlogSummary(title, content, env) {
  try {
    // Truncate content to avoid token limits
    const truncatedContent = content.slice(0, 4000);
    
    const prompt = `Summarize this tech blog article in JSON format.

Title: ${title}

Content: ${truncatedContent}

Return ONLY this JSON (no other text):
{"brief":"2-3 sentence summary","detailed":"detailed summary","keyPoints":["point1","point2","point3"],"technologies":["tech1","tech2"]}`;

    console.log('Calling AI for:', title.slice(0, 50));
    
    // Try the smaller, faster model first
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'user', content: prompt }
      ],
      max_tokens: 800
    });

    const text = response.response || response.text || '';
    console.log('AI Response length:', text.length, 'Preview:', text.slice(0, 150));
    
    // Try to parse JSON from response
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Validate the parsed object has expected fields
        if (parsed.brief && typeof parsed.brief === 'string') {
          return {
            brief: parsed.brief,
            detailed: parsed.detailed || parsed.brief,
            keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
            technologies: Array.isArray(parsed.technologies) ? parsed.technologies : []
          };
        }
      }
    } catch (e) {
      console.error('JSON parse error:', e.message, 'Text:', text.slice(0, 100));
    }

    // Fallback - try to extract useful text
    const cleanText = text.replace(/```json\n?|\n?```/g, '').trim();
    if (cleanText.length > 50) {
      return {
        brief: cleanText.slice(0, 300),
        detailed: cleanText,
        keyPoints: [],
        technologies: []
      };
    }
    
    return {
      brief: `Summary for: ${title.slice(0, 100)}`,
      detailed: 'Full summary generation pending.',
      keyPoints: [],
      technologies: []
    };
  } catch (error) {
    console.error('AI summary error:', error.message, error.stack);
    return {
      brief: 'Summary generation failed',
      detailed: 'Unable to generate summary at this time.',
      keyPoints: ['Error occurred during analysis'],
      technologies: []
    };
  }
}
