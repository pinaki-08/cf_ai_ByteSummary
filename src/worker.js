/**
 * ByteSummary - AI-Powered URL Summarizer
 * Cloudflare Worker with Workers AI (Llama 3.3) integration
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleCORS();
    }

    // API Routes
    if (url.pathname === "/api/summarize" && request.method === "POST") {
      return handleSummarize(request, env);
    }

    if (url.pathname === "/api/history" && request.method === "GET") {
      return handleHistory(env);
    }

    if (url.pathname === "/api/clear-history" && request.method === "POST") {
      return handleClearHistory(env);
    }

    // Let the assets binding handle static files (configured in wrangler.toml)
    // If no asset found, return 404
    return new Response("Not Found", { status: 404 });
  },
};

function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };
}

async function handleSummarize(request, env) {
  try {
    const { url: targetUrl } = await request.json();

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

    // Check cache first (memory/state)
    const cacheKey = `summary:${targetUrl}`;
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
    };

    // Store in cache (memory/state) - cache for 1 hour
    try {
      await env.SUMMARIES_CACHE?.put(cacheKey, JSON.stringify(result), {
        expirationTtl: 3600,
      });

      // Also store in history
      await addToHistory(env, result);
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
      // Remove script tags
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      // Remove style tags
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      // Remove nav, header, footer, aside
      .replace(/<(nav|header|footer|aside)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, "")
      // Remove HTML tags
      .replace(/<[^>]+>/g, " ")
      // Decode HTML entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Clean up whitespace
      .replace(/\s+/g, " ")
      .trim();

    // Limit content length for AI processing
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
    // Fallback summary if AI fails
    return `**Overview**: Content from ${title}\n\n**Note**: AI summarization temporarily unavailable. The page contains approximately ${content.length} characters of text content.`;
  }
}

async function addToHistory(env, result) {
  try {
    const historyKey = "summary_history";
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

async function handleHistory(env) {
  try {
    const historyKey = "summary_history";
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

async function handleClearHistory(env) {
  try {
    await env.SUMMARIES_CACHE?.delete("summary_history");
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
