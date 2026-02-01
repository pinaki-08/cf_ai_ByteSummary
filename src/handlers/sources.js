/**
 * User custom sources handlers
 */

import { jsonResponse } from '../utils/http.js';
import { getUserFromRequest } from '../utils/auth.js';

export async function handleGetUserSources(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }
  
  const sourcesData = await env.SUMMARIES_CACHE.get(`user_sources:${user.userId}`);
  const sources = sourcesData ? JSON.parse(sourcesData) : [];
  
  return jsonResponse({ sources });
}

export async function handleAddUserSource(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }
  
  try {
    const { name, url, logo, color } = await request.json();
    
    if (!name || !url) {
      return jsonResponse({ error: "Name and URL are required" }, 400);
    }
    
    // Validate URL
    try {
      new URL(url);
    } catch {
      return jsonResponse({ error: "Invalid URL format" }, 400);
    }
    
    // Get existing sources
    const sourcesData = await env.SUMMARIES_CACHE.get(`user_sources:${user.userId}`);
    const sources = sourcesData ? JSON.parse(sourcesData) : [];
    
    // Check for duplicate URLs
    if (sources.some(s => s.url === url)) {
      return jsonResponse({ error: "Source with this URL already exists" }, 400);
    }
    
    // Create new source
    const newSource = {
      id: `custom_${crypto.randomUUID().slice(0, 8)}`,
      name,
      url,
      logo: logo || '📰',
      color: color || '#6b7280',
      userId: user.userId,
      isCustom: true,
      createdAt: new Date().toISOString()
    };
    
    sources.push(newSource);
    
    await env.SUMMARIES_CACHE.put(`user_sources:${user.userId}`, JSON.stringify(sources));
    
    return jsonResponse({ success: true, source: newSource });
  } catch (error) {
    return jsonResponse({ error: "Failed to add source" }, 500);
  }
}

export async function handleDeleteUserSource(request, sourceId, env) {
  const user = await getUserFromRequest(request, env);
  if (!user) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }
  
  const sourcesData = await env.SUMMARIES_CACHE.get(`user_sources:${user.userId}`);
  let sources = sourcesData ? JSON.parse(sourcesData) : [];
  
  const originalLength = sources.length;
  sources = sources.filter(s => s.id !== sourceId);
  
  if (sources.length === originalLength) {
    return jsonResponse({ error: "Source not found" }, 404);
  }
  
  await env.SUMMARIES_CACHE.put(`user_sources:${user.userId}`, JSON.stringify(sources));
  
  return jsonResponse({ success: true });
}

export async function getAllUserCustomSources(env) {
  const allSources = [];
  const seenUrls = new Set();
  
  try {
    const listResult = await env.SUMMARIES_CACHE.list({ prefix: 'user_sources:' });
    
    for (const key of listResult.keys) {
      const sourcesData = await env.SUMMARIES_CACHE.get(key.name);
      if (sourcesData) {
        const sources = JSON.parse(sourcesData);
        for (const source of sources) {
          if (!seenUrls.has(source.url)) {
            seenUrls.add(source.url);
            allSources.push(source);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error fetching custom sources:', err);
  }
  
  return allSources;
}
