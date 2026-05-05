const SUPABASE_URL = 'https://dktkrsclizjwfsolgfir.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrdGtyc2NsaXpqd2Zzb2xnZmlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDE1NjEsImV4cCI6MjA5MzIxNzU2MX0.Q8q9ATWw9j1gxDDstOPyjgXtcGzS_fhZO_V_J6utwAU';

const SYSTEM_PROMPT = `You are a content strategist for WildWell Wellbeing, created by Vicky Denning. WildWell supports two distinct audiences:

AUDIENCE 1 — Women in Midlife (not necessarily in business): Women aged 38-58 navigating perimenopause, identity shifts, burnout, feeling lost or disconnected, motherhood transitions, relationships changing, bodies changing. They feel stuck, heavy, exhausted, disconnected from themselves. They are looking for real answers, not toxic positivity.

AUDIENCE 2 — Women Growing a Business (who may also be midlife, mums, perimenopausal): Women building businesses who hit invisible ceilings, struggle with visibility, feel blocked around money or success, burn out trying to keep up, feel like something deeper is getting in the way of growth.

Search the web and find what is ACTUALLY happening right now today. I want SPECIFIC, NAMED things:
- The exact TikTok sounds, challenges or formats going viral THIS WEEK (name them)
- Specific celebrity news everyone is talking about RIGHT NOW (name the celebrity and what happened)
- Specific products going viral on TikTok, Instagram or Amazon this week (name the product)
- Real news stories from the last 48 hours that women are reacting to (name the story)
- Specific TV shows, films or moments people are obsessing over (name them)
- Specific social media trends spreading across Facebook, Instagram, TikTok today
- Wellness, health or lifestyle stories blowing up right now

For each trend give TWO content angles — one for each audience — showing how Vicky or her community can connect this exact moment to their content.

The angles for Audience 1 should connect the trend to nervous system regulation, perimenopause, identity shift, emotional processing, or midlife as a threshold.

The angles for Audience 2 should connect the trend to visibility, subconscious blocks, nervous system and business, identity as an entrepreneur, or sustainable growth.

All hooks must sound like a real woman wrote them — warm, honest, direct. Not marketing speak. Written for Facebook or Instagram.

BAD: "A celebrity is in the news"
GOOD: "Rebel Wilson opened up about her fertility journey and women everywhere are in the comments sharing their own stories"

Return ONLY valid JSON, no markdown, no preamble:
{"trends":[{"topic":"SPECIFIC named trend/person/product/moment","category":"tiktok|celebrity|product|news|tv|wellness|social","urgency":"now|watchlist","midlife_angle":"1-2 sentences connecting this to nervous system, perimenopause, identity or emotional healing for women in midlife","business_angle":"1-2 sentences connecting this to visibility, subconscious blocks, nervous system or identity for women in business","midlife_hooks":["hook1","hook2"],"business_hooks":["hook1","hook2"]}]}

Return exactly 6 trends. All must be real, named, specific things happening right now.`;

exports.handler = async function(event, context) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('No Anthropic API key');
    return { statusCode: 500, body: 'No API key' };
  }

  try {
    console.log('Starting WildWell trend refresh...');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Today is ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Search the web right now. Find what is SPECIFICALLY trending today — the actual TikTok sound everyone is using, the specific celebrity in the news, the exact product going viral, the real TV moment, the specific social media trend. Search "trending on TikTok today", "viral on Instagram today", "celebrity news today UK", "what is everyone talking about today UK", "trending wellness 2026", "viral products UK this week", "social media trends May 2026". Return specific named things only. Return your JSON.`
        }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }]
      })
    });

    if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);

    const data = await response.json();
    const textContent = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    const start = textContent.indexOf('{');
    const end = textContent.lastIndexOf('}');
    if (start === -1) throw new Error('No JSON found in response');

    const parsed = JSON.parse(textContent.slice(start, end + 1));
    if (!parsed.trends || !Array.isArray(parsed.trends)) throw new Error('Invalid trends format');

    console.log(`Got ${parsed.trends.length} trends, saving to Supabase...`);

    await fetch(`${SUPABASE_URL}/rest/v1/wildwell_trends_cache?id=gt.0`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/wildwell_trends_cache`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        trends_data: JSON.stringify(parsed),
        refreshed_at: new Date().toISOString()
      })
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      throw new Error(`Supabase insert failed: ${insertRes.status} — ${errText}`);
    }

    console.log('WildWell trends saved successfully');
    return { statusCode: 200, body: JSON.stringify({ success: true, count: parsed.trends.length }) };

  } catch (err) {
    console.error('Refresh error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
