/**
 * Application constants and configuration
 */

export const BLOG_SOURCES = [
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

export const CATEGORIES = [
  { id: 'all', name: 'All Topics', icon: '📚' },
  { id: 'ml', name: 'Machine Learning', icon: '🤖' },
  { id: 'engineering', name: 'Engineering', icon: '⚙️' },
  { id: 'infrastructure', name: 'Infrastructure', icon: '🏗️' },
  { id: 'data', name: 'Data', icon: '📊' },
  { id: 'mobile', name: 'Mobile', icon: '📱' },
  { id: 'web', name: 'Web', icon: '🌐' }
];

export const COOKIE_NAME = "bytesummary_session";
export const SESSION_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

export const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1'
};

export const SKIP_PATTERNS = [
  'tag', 'category', 'author', 'page', 'search', 'about', 'contact',
  'privacy', 'terms', 'login', 'signup', 'register', 'feed', 'rss',
  'cdn-cgi', 'static', 'assets', 'images', 'css', 'js', 'archive',
  'followers', 'following', 'membership', 'subscribe', 'newsletter'
];
