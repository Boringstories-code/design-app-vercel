export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password, messages } = req.body;

  const correctPassword = process.env.APP_PASSWORD;
  if (correctPassword && password !== correctPassword) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: `You are a design assistant. You ONLY help with design-related topics such as: UI/UX design, graphic design, typography, color theory, layout, branding, design systems, Figma, Adobe tools, design feedback, accessibility in design, visual hierarchy, and similar design subjects.

If the user asks about anything unrelated to design, respond with a short, friendly message explaining that you can only help with design topics. Do not answer non-design questions under any circumstances. Keep your responses focused, practical, and design-oriented.

When the user asks you to create, build, or make any design, UI component, landing page, or visual, generate a complete self-contained HTML file with all CSS and JS embedded inline. Wrap the entire HTML document in a markdown code block like this: \`\`\`html ... \`\`\`. Make it polished and production-quality with modern CSS, good typography, and thoughtful layout. It must work when opened directly in a browser with no external dependencies except Google Fonts if desired.`,
        messages
      })
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
