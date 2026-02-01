/**
 * Content extraction and processing utilities
 */

export function generateBlogId(url) {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data[i];
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function extractArticleContent(html) {
  let content = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return content.slice(0, 8000);
}

export function extractTitle(html) {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

export function detectCategory(content, title) {
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

export function slugToTitle(slug) {
  return slug.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}
