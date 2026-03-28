export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body;
  try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }

  const { password, prompt, css } = body;

  const correctPassword = process.env.APP_PASSWORD;
  if (correctPassword && password !== correctPassword) {
    return new Response(JSON.stringify({ error: 'Incorrect password' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'API key not configured' }), {
    status: 500, headers: { 'Content-Type': 'application/json' }
  });

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      stream: true,
      system: `You are an expert UI/UX designer and front-end developer. The user has a design system with CSS variables already defined. Your job is to generate beautiful, production-quality HTML designs using ONLY those CSS variables for all colors, typography, spacing, and effects.

RULES:
- Use the provided CSS variables exclusively (--color-primary, --font-size, --space-md, --radius-md, etc.)
- Build fully interactive components with hover/active/focus states using the token variables
- Output ONLY a raw HTML fragment (no DOCTYPE, no html/head/body tags)
- You may add a scoped <style> block but MUST use var(--...) for all values — never hardcode colors or sizes
- Make it visually rich and production-ready
- Output ONLY the HTML. No explanation, no markdown, no code fences. Raw HTML only.`,
      messages: [{ role: 'user', content: `Design tokens CSS:\n\n${css}\n\nRequest: ${prompt}\n\nOutput the HTML fragment now.` }]
    })
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.json();
    return new Response(JSON.stringify({ error: err.error?.message || 'API error' }), {
      status: anthropicRes.status, headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(anthropicRes.body, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' }
  });
}
