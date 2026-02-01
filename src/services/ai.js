/**
 * AI Summary generation service
 */

export async function generateBlogSummary(title, content, env) {
  try {
    const truncatedContent = content.slice(0, 4000);
    
    const prompt = `Summarize this tech blog article in JSON format.

Title: ${title}

Content: ${truncatedContent}

Return ONLY this JSON (no other text):
{"brief":"2-3 sentence summary","detailed":"detailed summary","keyPoints":["point1","point2","point3"],"technologies":["tech1","tech2"]}`;

    console.log('Calling AI for:', title.slice(0, 50));
    
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'user', content: prompt }
      ],
      max_tokens: 800
    });

    const text = response.response || response.text || '';
    console.log('AI Response length:', text.length, 'Preview:', text.slice(0, 150));
    
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
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
