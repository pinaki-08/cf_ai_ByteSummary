# ByteSummary - AI-Powered Tech Content Summarizer

A modern web application that uses Cloudflare's AI infrastructure to provide instant summaries of any tech article, blog post, or documentation. Now with **per-user portal** support!

![ByteSummary](https://img.shields.io/badge/Powered%20by-Cloudflare%20Workers%20AI-orange)

## 🚀 Features

- **AI-Powered Summarization**: Uses Llama 3.3 70B on Cloudflare Workers AI
- **User Authentication**: Register and login to save your personal history
- **Per-User Portal**: Each user gets their own dashboard with stats
- **Smart Caching**: Results are cached in KV storage for faster repeat access
- **History Tracking**: Keep track of your recent summaries (per-user when logged in)
- **User Stats**: Track total summaries, weekly activity, and time saved
- **Beautiful UI**: Modern, responsive design with dark theme
- **Tech-Focused**: Summaries are optimized for technical content

## 🏗️ Architecture

This application uses the following Cloudflare technologies:

| Component | Technology | Purpose |
|-----------|------------|---------|
| **LLM** | Workers AI (Llama 3.3 70B) | Content summarization |
| **Backend** | Cloudflare Workers | API routing, auth, and coordination |
| **Frontend** | Cloudflare Workers (Static Assets) | UI hosting |
| **State/Memory** | Workers KV | User data, sessions, caching, and history |

## 📋 Prerequisites

- Node.js 18+
- A Cloudflare account
- Wrangler CLI (included in devDependencies)

## 🛠️ Setup

### 1. Clone and Install

```bash
cd cf_ai_ByteSummary
npm install
```

### 2. Login to Cloudflare

```bash
npx wrangler login
```

### 3. Create KV Namespace

```bash
# Create the KV namespace for production
npx wrangler kv namespace create SUMMARIES_CACHE

# Create the KV namespace for development/preview
npx wrangler kv namespace create SUMMARIES_CACHE --preview
```

### 4. Update wrangler.toml

Replace the placeholder IDs in `wrangler.toml` with the actual IDs from step 3:

```toml
[[kv_namespaces]]
binding = "SUMMARIES_CACHE"
id = "your-production-id-here"
preview_id = "your-preview-id-here"
```

### 5. Run Locally

```bash
npm run dev
```

This starts the Worker locally at `http://localhost:8787`

### 6. Open the Frontend

Open `public/index.html` in your browser, or serve it with any static server:

```bash
npx serve public
```

## 🚀 Deployment

### Deploy the Worker

```bash
npm run deploy
```

### Deploy the Frontend to Pages

```bash
npm run deploy:pages
```

Or connect your GitHub repository to Cloudflare Pages for automatic deployments.

## 📁 Project Structure

```
cf_ai_ByteSummary/
├── src/
│   └── worker.js          # Cloudflare Worker (API backend)
├── public/
│   └── index.html         # Frontend application
├── wrangler.toml          # Wrangler configuration
├── package.json           # Project dependencies
└── README.md              # This file
```

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/summarize` | POST | Summarize a URL |
| `/api/history` | GET | Get summary history |
| `/api/clear-history` | POST | Clear summary history |

### Example Request

```bash
curl -X POST http://localhost:8787/api/summarize \
  -H "Content-Type: application/json" \
  -d '{"url": "https://blog.cloudflare.com/workers-ai"}'
```

## 🎨 Tech Stack

- **Backend**: Cloudflare Workers (JavaScript)
- **AI Model**: Llama 3.3 70B Instruct (via Workers AI)
- **Storage**: Cloudflare KV
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Fonts**: Inter & JetBrains Mono
- **Styling**: Custom CSS with CSS Variables

## 📝 License

MIT License

## 🙏 Acknowledgments

- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare KV](https://developers.cloudflare.com/kv/)
