/**
 * Blog API handlers
 */

import { jsonResponse } from '../utils/http.js';
import { BLOG_SOURCES, CATEGORIES } from '../config/constants.js';

export async function handleGetBlogs(request, env) {
  const url = new URL(request.url);
  const source = url.searchParams.get('source') || 'all';
  const category = url.searchParams.get('category') || 'all';
  const days = parseInt(url.searchParams.get('days') || '30');
  
  const indexData = await env.SUMMARIES_CACHE.get('blogs:index');
  let blogs = indexData ? JSON.parse(indexData) : [];
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  blogs = blogs.filter(blog => {
    if (source !== 'all' && blog.source !== source) return false;
    if (category !== 'all' && blog.category !== category) return false;
    if (new Date(blog.fetchedAt) < cutoffDate) return false;
    return true;
  });
  
  blogs.sort((a, b) => new Date(b.fetchedAt) - new Date(a.fetchedAt));
  
  return jsonResponse({ blogs, total: blogs.length });
}

export function handleGetSources() {
  return jsonResponse({ sources: BLOG_SOURCES });
}

export function handleGetCategories() {
  return jsonResponse({ categories: CATEGORIES });
}

export async function handleGetBlogDetail(blogId, env) {
  const blogData = await env.SUMMARIES_CACHE.get(`blog:${blogId}`);
  if (!blogData) {
    return jsonResponse({ error: "Blog not found" }, 404);
  }
  return jsonResponse({ blog: JSON.parse(blogData) });
}

export async function handleGetJobStatus(env) {
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

export async function handleClearCache(env) {
  try {
    await env.SUMMARIES_CACHE.delete('blogs:index');
    await env.SUMMARIES_CACHE.delete('job:status');
    
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
