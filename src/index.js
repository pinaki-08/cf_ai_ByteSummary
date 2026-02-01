/**
 * ByteSummary - AI-Powered Tech Blog Aggregator
 * Cloudflare Worker with Workers AI (Llama 3.1) integration
 * Automatically fetches and summarizes tech blogs from major companies
 */

import { handleCORS, jsonResponse } from './utils/http.js';
import { handleRegister, handleLogin, handleLogout, handleGetCurrentUser } from './handlers/auth.js';
import { handleGetUserSources, handleAddUserSource, handleDeleteUserSource } from './handlers/sources.js';
import { handleGetBlogs, handleGetSources, handleGetCategories, handleGetBlogDetail, handleGetJobStatus, handleClearCache } from './handlers/blogs.js';
import { fetchAndProcessBlogs } from './services/processor.js';

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

    // User custom sources endpoints
    if (url.pathname === "/api/user/sources" && request.method === "GET") {
      return handleGetUserSources(request, env);
    }
    if (url.pathname === "/api/user/sources" && request.method === "POST") {
      return handleAddUserSource(request, env);
    }
    if (url.pathname.match(/^\/api\/user\/sources\/[^/]+$/) && request.method === "DELETE") {
      const sourceId = url.pathname.split("/api/user/sources/")[1];
      return handleDeleteUserSource(request, sourceId, env);
    }

    return env.ASSETS.fetch(request);
  },

  // Scheduled task - runs daily at 6 AM UTC
  async scheduled(event, env, ctx) {
    ctx.waitUntil(fetchAndProcessBlogs(env));
  }
};
