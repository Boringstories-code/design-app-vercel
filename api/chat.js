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
- Use your knowledge of real professional software interfaces as reference (e.g. Q-SYS, Crestron, audio mixers, admin panels, Figma, enterprise dashboards)
- When an image is uploaded, analyze its layout, color scheme, component structure, and spacing precisely — then recreate or draw inspiration from it faithfully

QUALITY STANDARDS:
- Every component must look production-ready, not like a prototype
- Use consistent spacing (8px grid), proper border radius, subtle shadows where appropriate
- Include realistic placeholder content and labels that match the described use case
- Every design must have interactive states: hover, active, focus, disabled
- Use CSS variables for theming consistency throughout the file
- Typography: use a professional system font stack or Google Font — never default browser styles

CRITICAL output format — follow exactly:
1. One short plain English sentence only before the code (e.g. "Here's your channel mixer UI.")
2. Immediately output: \`\`\`html ... \`\`\`
3. Nothing after the closing code fence
4. NEVER write code, markdown, bullet points, or explanations outside the code block

If a request is unclear, make a reasonable professional assumption and build the most useful version of what was likely intended. Never ask clarifying questions — just build it.`,      messages
    })
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.json();
    return new Response(JSON.stringify({ error: err.error?.message || 'API error' }), {
      status: anthropicRes.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(anthropicRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no'
    }
  });
}
