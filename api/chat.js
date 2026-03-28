export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { password, messages } = body;

  const correctPassword = process.env.APP_PASSWORD;
  if (correctPassword && password !== correctPassword) {
    return new Response(JSON.stringify({ error: 'Incorrect password' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      stream: true,
      system: `You are a world-class UI/UX designer and creative front-end developer with expertise across every design style and discipline. You can build anything — from polished corporate dashboards to bold creative landing pages, audio control interfaces, data visualizations, interactive tools, games, and anything in between.

CAPABILITIES:
- Any design style: minimal, bold, brutalist, glassmorphism, neumorphism, retro, futuristic, corporate, playful
- Any UI type: dashboards, control panels, landing pages, components, forms, data tables, audio/visual GUIs, games, creative tools
- Full interactivity: animations, transitions, real-time updates, canvas, Web Audio API, dynamic rendering
- Advanced CSS and JS — production quality output only

DESIGN QUALITY STANDARDS:
- Every output must be visually striking and production-ready — never bland or generic
- Use thoughtful color palettes, excellent typography, and intentional spacing
- Every element must have hover/active/focus states
- Match the tone of the request — a mixer UI should feel like pro audio software
- When given an image, extract colors, layout, components, typography and recreate faithfully

OUTPUT FORMAT — follow exactly, no exceptions:
Respond with ONLY a fenced html code block. No text before it, no text after it.
\`\`\`html
<!DOCTYPE html>...
\`\`\``,
      messages
    })
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.json();
    return new Response(JSON.stringify({ error: err.error?.message || 'API error' }), {
      status: anthropicRes.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Simple pass-through stream — no interception
  return new Response(anthropicRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no'
    }
  });
}
