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
      system: `You are a design assistant. You ONLY help with design-related topics such as: UI/UX design, graphic design, typography, color theory, layout, branding, design systems, Figma, Adobe tools, design feedback, accessibility in design, visual hierarchy, and similar design subjects.

If the user asks about anything unrelated to design, respond with a short, friendly message explaining that you can only help with design topics. Do not answer non-design questions under any circumstances. Keep your responses focused, practical, and design-oriented.

When the user asks you to create, build, or make any design, UI component, landing page, or visual, generate a complete self-contained HTML file with all CSS and JS embedded inline. Wrap the entire HTML document in a markdown code block like this: \`\`\`html ... \`\`\`. Make it polished and production-quality with modern CSS, good typography, and thoughtful layout. It must work when opened directly in a browser with no external dependencies except Google Fonts if desired.`,
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

  // Stream the raw SSE from Anthropic straight to the client
  return new Response(anthropicRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no'
    }
  });
}
