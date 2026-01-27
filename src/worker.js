/**
 * ByteSummary - AI-Powered URL Summarizer
 * Cloudflare Worker with Workers AI (Llama 3.3) integration
 * Now with per-user portal support
 */

// Simple token-based auth (in production, use Cloudflare Access or OAuth)
const COOKIE_NAME = "bytesummary_session";
const SESSION_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleCORS();
    }

    // Auth Routes (no auth required)
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

    // API Routes (with optional auth for personalization)
    if (url.pathname === "/api/summarize" && request.method === "POST") {
      return handleSummarize(request, env);
    }

    if (url.pathname === "/api/history" && request.method === "GET") {
      return handleHistory(request, env);
    }

    if (url.pathname === "/api/clear-history" && request.method === "POST") {
      return handleClearHistory(request, env);
    }

    // User stats endpoint
    if (url.pathname === "/api/user/stats" && request.method === "GET") {
      return handleUserStats(request, env);
    }

    // Let the assets binding handle static files (configured in wrangler.toml)
    // If no asset found, return 404
    return new Response("Not Found", { status: 404 });
  },
};

// ==================== AUTH HELPERS ====================

function generateSessionToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function getSessionToken(request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map(c => {
      const [key, ...val] = c.trim().split("=");
      return [key, val.join("=")];
    })
  );
  return cookies[COOKIE_NAME] || null;
}

async function getCurrentUser(request, env) {
  const token = getSessionToken(request);
  if (!token) return null;

  try {
    const sessionData = await env.SUMMARIES_CACHE?.get(`session:${token}`);
    if (!sessionData) return null;
    
    const session = JSON.parse(sessionData);
    const userData = await env.SUMMARIES_CACHE?.get(`user:${session.userId}`);
    if (!userData) return null;
    
    const user = JSON.parse(userData);
    return { id: session.userId, email: user.email, name: user.name };
  } catch (e) {
    console.log("Auth error:", e);
    return null;
  }
}

function setSessionCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_EXPIRY}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

// ==================== AUTH HANDLERS ====================

async function handleRegister(request, env) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email and password are required" }),
        { status: 400, headers: corsHeaders() }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: corsHeaders() }
      );
    }

    // Check if user exists
    const existingUser = await env.SUMMARIES_CACHE?.get(`user_email:${email.toLowerCase()}`);
    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "Email already registered" }),
        { status: 400, headers: corsHeaders() }
      );
    }

    // Create user
    const userId = generateSessionToken().slice(0, 16);
    const passwordHash = await hashPassword(password);
    
    const user = {
      id: userId,
      email: email.toLowerCase(),
      name: name || email.split("@")[0],
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    // Store user data
    await env.SUMMARIES_CACHE?.put(`user:${userId}`, JSON.stringify(user));
    await env.SUMMARIES_CACHE?.put(`user_email:${email.toLowerCase()}`, userId);

    // Create session
    const sessionToken = generateSessionToken();
    await env.SUMMARIES_CACHE?.put(
      `session:${sessionToken}`,
      JSON.stringify({ userId, createdAt: new Date().toISOString() }),
      { expirationTtl: SESSION_EXPIRY }
    );

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: { id: userId, email: user.email, name: user.name } 
      }),
      { 
        headers: {
          ...corsHeaders(),
          "Set-Cookie": setSessionCookie(sessionToken)
        }
      }
    );
  } catch (error) {
    console.error("Register error:", error);
    return new Response(
      JSON.stringify({ error: "Registration failed" }),
      { status: 500, headers: corsHeaders() }
    );
  }
}

async function handleLogin(request, env) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email and password are required" }),
        { status: 400, headers: corsHeaders() }
      );
    }

    // Find user
    const userId = await env.SUMMARIES_CACHE?.get(`user_email:${email.toLowerCase()}`);
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Invalid email or password" }),
        { status: 401, headers: corsHeaders() }
      );
    }

    const userData = await env.SUMMARIES_CACHE?.get(`user:${userId}`);
    if (!userData) {
      return new Response(
        JSON.stringify({ error: "Invalid email or password" }),
        { status: 401, headers: corsHeaders() }
      );
    }

    const user = JSON.parse(userData);
    const passwordHash = await hashPassword(password);

    if (user.passwordHash !== passwordHash) {
      return new Response(
        JSON.stringify({ error: "Invalid email or password" }),
        { status: 401, headers: corsHeaders() }
      );
    }

    // Create session
    const sessionToken = generateSessionToken();
    await env.SUMMARIES_CACHE?.put(
      `session:${sessionToken}`,
      JSON.stringify({ userId, createdAt: new Date().toISOString() }),
      { expirationTtl: SESSION_EXPIRY }
    );

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: { id: userId, email: user.email, name: user.name } 
      }),
      { 
        headers: {
          ...corsHeaders(),
          "Set-Cookie": setSessionCookie(sessionToken)
        }
      }
    );
  } catch (error) {
    console.error("Login error:", error);
    return new Response(
      JSON.stringify({ error: "Login failed" }),
      { status: 500, headers: corsHeaders() }
    );
  }
}

async function handleLogout() {
  return new Response(
    JSON.stringify({ success: true }),
    { 
      headers: {
        ...corsHeaders(),
        "Set-Cookie": clearSessionCookie()
      }
    }
  );
}

async function handleGetCurrentUser(request, env) {
  const user = await getCurrentUser(request, env);
  
  if (!user) {
    return new Response(
      JSON.stringify({ user: null }),
      { headers: corsHeaders() }
    );
  }

  return new Response(
    JSON.stringify({ user }),
    { headers: corsHeaders() }
  );
}

async function handleUserStats(request, env) {
  const user = await getCurrentUser(request, env);
  
  if (!user) {
    return new Response(
      JSON.stringify({ error: "Not authenticated" }),
      { status: 401, headers: corsHeaders() }
    );
  }

  try {
    const historyKey = `user_history:${user.id}`;
    const history = await env.SUMMARIES_CACHE?.get(historyKey);
    const historyData = history ? JSON.parse(history) : [];

    return new Response(
      JSON.stringify({
        totalSummaries: historyData.length,
        recentActivity: historyData.slice(0, 5),
        memberSince: user.createdAt || "Unknown"
      }),
      { headers: corsHeaders() }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ totalSummaries: 0, recentActivity: [] }),
      { headers: corsHeaders() }
    );
  }
}

// ==================== EXISTING FUNCTIONS (UPDATED) ====================

function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
  };
}

async function handleSummarize(request, env) {
  try {
    const { url: targetUrl } = await request.json();
    const user = await getCurrentUser(request, env);

    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: corsHeaders() }
      );
    }

    // Validate URL
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL format" }),
        { status: 400, headers: corsHeaders() }
      );
    }

    // Check cache first (memory/state) - user-specific if logged in
    const cacheKey = user 
      ? `user_summary:${user.id}:${targetUrl}`
      : `summary:${targetUrl}`;
    let cached = null;
    
    try {
      cached = await env.SUMMARIES_CACHE?.get(cacheKey);
      if (cached) {
        const cachedData = JSON.parse(cached);
        return new Response(
          JSON.stringify({ ...cachedData, fromCache: true }),
          { headers: corsHeaders() }
        );
      }
    } catch (e) {
      console.log("Cache miss or error:", e);
    }

    // Fetch the webpage content
    const pageContent = await fetchPageContent(targetUrl);
    
    if (!pageContent.success) {
      return new Response(
        JSON.stringify({ error: pageContent.error }),
        { status: 400, headers: corsHeaders() }
      );
    }

    // Generate summary using Workers AI (Llama 3.3)
    const summary = await generateSummary(env, pageContent.content, pageContent.title, targetUrl);

    const result = {
      url: targetUrl,
      title: pageContent.title,
      summary: summary,
      timestamp: new Date().toISOString(),
      fromCache: false,
      userId: user?.id || null,
    };

    // Store in cache (memory/state) - cache for 1 hour
    try {
      await env.SUMMARIES_CACHE?.put(cacheKey, JSON.stringify(result), {
        expirationTtl: 3600,
      });

      // Also store in history (user-specific if logged in)
      await addToHistory(env, result, user);
    } catch (e) {
      console.log("Cache write error:", e);
    }

    return new Response(JSON.stringify(result), { headers: corsHeaders() });
  } catch (error) {
    console.error("Summarize error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request: " + error.message }),
      { status: 500, headers: corsHeaders() }
    );
  }
}

async function fetchPageContent(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ByteSummary/1.0; +https://bytesummary.pages.dev)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return { success: false, error: `Failed to fetch URL: ${response.status}` };
    }

    const html = await response.text();
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "Untitled";

    // Extract main content (remove scripts, styles, nav, footer, etc.)
    let content = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<(nav|header|footer|aside)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    content = content.slice(0, 8000);

    return { success: true, content, title };
  } catch (error) {
    return { success: false, error: `Failed to fetch content: ${error.message}` };
  }
}

async function generateSummary(env, content, title, url) {
  const prompt = `You are a tech content summarizer. Analyze the following webpage content and provide a comprehensive summary focused on the key technical information.

Title: ${title}
URL: ${url}

Content:
${content}

Please provide:
1. **Overview**: A brief 2-3 sentence overview of what this content is about
2. **Key Points**: The main technical points or features (bullet points)
3. **Tech Stack/Technologies**: Any technologies, frameworks, or tools mentioned
4. **Takeaways**: Key insights or actionable items

Keep the summary informative yet concise. Focus on technical details that would be valuable for a developer or tech professional.`;

  try {
    const response = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [
        {
          role: "system",
          content: "You are a helpful tech content summarizer that creates clear, structured summaries of technical articles and documentation. Always format your response with clear sections using markdown."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 1024,
      temperature: 0.3,
    });

    return response.response || "Unable to generate summary.";
  } catch (error) {
    console.error("AI error:", error);
    return `**Overview**: Content from ${title}\n\n**Note**: AI summarization temporarily unavailable. The page contains approximately ${content.length} characters of text content.`;
  }
}

async function addToHistory(env, result, user) {
  try {
    // User-specific history if logged in, otherwise global
    const historyKey = user ? `user_history:${user.id}` : "summary_history";
    let history = [];
    
    const existing = await env.SUMMARIES_CACHE?.get(historyKey);
    if (existing) {
      history = JSON.parse(existing);
    }
    
    // Add new entry at the beginning
    history.unshift({
      url: result.url,
      title: result.title,
      timestamp: result.timestamp,
    });
    
    // Keep only last 50 entries
    history = history.slice(0, 50);
    
    await env.SUMMARIES_CACHE?.put(historyKey, JSON.stringify(history));
  } catch (e) {
    console.log("History update error:", e);
  }
}

async function handleHistory(request, env) {
  try {
    const user = await getCurrentUser(request, env);
    const historyKey = user ? `user_history:${user.id}` : "summary_history";
    const history = await env.SUMMARIES_CACHE?.get(historyKey);
    
    return new Response(
      JSON.stringify({ history: history ? JSON.parse(history) : [] }),
      { headers: corsHeaders() }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ history: [] }),
      { headers: corsHeaders() }
    );
  }
}

async function handleClearHistory(request, env) {
  try {
    const user = await getCurrentUser(request, env);
    const historyKey = user ? `user_history:${user.id}` : "summary_history";
    await env.SUMMARIES_CACHE?.delete(historyKey);
    return new Response(
      JSON.stringify({ success: true }),
      { headers: corsHeaders() }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: corsHeaders() }
    );
  }
}
