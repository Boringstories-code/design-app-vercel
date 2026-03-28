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
      system: `You are an expert UI/UX designer and front-end developer specializing in corporate and professional design systems. You build high-quality, polished UI components and system GUIs.

YOUR SPECIALTY:
- UI components: buttons, forms, inputs, modals, tabs, tables, cards, navigation bars, sidebars, tooltips, dropdowns, badges, toggles, progress bars, notifications
- System GUIs: admin dashboards, control panels, settings pages, data tables, multi-room audio/visual control interfaces, device management UIs, status monitors
- Style: clean, professional, corporate — precise spacing, clear hierarchy, neutral color palettes with purposeful accent colors, readable typography

HOW TO INTERPRET REQUESTS:
- Read the request carefully and identify exactly what UI component or system interface is being described
- If the request mentions specific functionality (e.g. "mute buttons", "channel controls", "fader", "mixer"), build a realistic, functional-looking GUI for that purpose
- Use your knowledge of real professional software interfaces as reference
- When an image is uploaded, analyze its layout, color scheme, component structure, and spacing — then recreate or draw inspiration from it faithfully

QUALITY STANDARDS:
- Every component must look production-ready
- Use consistent spacing (8px grid), proper border radius, subtle shadows where appropriate
- Include realistic placeholder content and labels that match the described use case
- Every design must have interactive states: hover, active, focus, disabled
- Use CSS variables for theming consistency
- Typography: use a professional system font stack or Google Font

CRITICAL output format — you MUST follow this exactly, every single time:
- Your ENTIRE response must be ONLY a code block. Nothing else.
- Start your response with: \`\`\`html
- End your response with: \`\`\`
- Do NOT write any text before or after the code block. Not even one word. Not a title, not a description, not a sentence. ONLY the code block.
- NEVER explain, describe, or introduce the design outside the code block.
- If you want to label the design, put a <title> tag inside the HTML.

If a request is unclear, make a reasonable professional assumption and build it. Never ask clarifying questions.`,
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

  // Stream through but accumulate full text, then post-process before sending
  const reader = anthropicRes.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = '';
      let sentIntro = false;

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

            // Only start forwarding once we hit ```html — suppress everything before it
            if (!sentIntro) {
              if (fullText.includes('```html')) {
                sentIntro = true;
                // Send a synthetic delta with just a marker so frontend knows generation started
                const synth = { ...parsed, delta: { type: 'text_delta', text: '```html\n' } };
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(synth)}\n\n`));
              }
              // Don't forward anything until we've seen ```html
            } else {
              // Forward normally but strip the opening ```html we already sent
              if (fullText.split('```html').length === 2) {
                controller.enqueue(new TextEncoder().encode(line + '\n\n'));
              } else {
                controller.enqueue(new TextEncoder().encode(line + '\n\n'));
              }
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
