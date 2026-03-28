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
- Any design style: minimal, bold, brutalist, glassmorphism, neumorphism, retro, futuristic, corporate, playful — whatever fits the request
- Any UI type: dashboards, control panels, landing pages, components, forms, data tables, audio/visual GUIs, games, creative tools, portfolios, editors
- Full interactivity: animations, transitions, real-time updates, drag interactions, canvas drawing, audio visualizers, live data simulations
- Advanced CSS: custom properties, grid, flexbox, animations, gradients, filters, clip-path, backdrop-filter
- Advanced JS: event handling, state management, canvas API, Web Audio API, localStorage, timers, dynamic rendering

DESIGN QUALITY STANDARDS:
- Every output must be visually striking and production-ready — never bland or generic
- Use thoughtful color palettes, excellent typography, and intentional spacing
- Every element must have hover/active/focus states and feel fully interactive
- Match the tone and energy of the request — a mixer UI should feel like pro audio software, a landing page should feel like a real product site
- When given an image, study it carefully: extract colors, layout structure, component patterns, typography style, and recreate or riff on it faithfully

ABSOLUTE OUTPUT RULE — this overrides everything else:
Your response must contain ONLY a single fenced code block. Nothing before it, nothing after it.
Format:
\`\`\`html
<!DOCTYPE html>
...full HTML...
\`\`\`
Do NOT write any text, explanation, introduction, or commentary outside the code block under any circumstances. If you need to name or describe the design, put it in the HTML <title> or as a comment inside the code.`,
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

  const reader = anthropicRes.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = '';
      let htmlStarted = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.delta?.text || '';
            if (!delta) {
              controller.enqueue(new TextEncoder().encode(line + '\n\n'));
              continue;
            }

            fullText += delta;

            if (!htmlStarted) {
              if (fullText.includes('```html')) {
                htmlStarted = true;
                const synth = { ...parsed, delta: { type: 'text_delta', text: '```html\n' } };
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(synth)}\n\n`));
              }
              // suppress everything until ```html appears
            } else {
              controller.enqueue(new TextEncoder().encode(line + '\n\n'));
            }
          } catch {
            controller.enqueue(new TextEncoder().encode(line + '\n\n'));
          }
        }
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no'
    }
  });
}
