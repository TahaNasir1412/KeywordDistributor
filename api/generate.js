// api/generate.js
//
// This is the ONLY place your Gemini key lives. It runs on Vercel's server,
// never in the browser, so it's never visible to anyone who opens the page
// or views its source. The frontend (kw_tool.html) calls this endpoint
// instead of calling Gemini directly.
//
// Setup: in your Vercel project settings -> Environment Variables, add:
//   GEMINI_API_KEY = your_real_key_here
// Never put the key in this file or anywhere in the repo.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, json, tier } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "prompt" in request body' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: GEMINI_API_KEY is not set in Vercel environment variables' });
  }

  // Cost/token efficiency: always use a Flash-tier model, never a Pro-tier one --
  // this tool's tasks (keyword classification, short copy generation) don't need
  // frontier reasoning, and Flash models are dramatically cheaper and faster.
  // "quick" tasks (small judgment calls) get the lighter model; everything else
  // gets the standard flash model. Check ai.google.dev/gemini-api/docs/models
  // for the current model list and pricing before deploying, since availability
  // and names can change -- swap the strings below if a model is retired.
  const model = tier === 'quick' ? 'gemini-2.0-flash-lite' : 'gemini-2.0-flash';

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const generationConfig = {
    maxOutputTokens: 2048, // caps runaway responses -- keeps cost predictable
  };
  if (json) {
    generationConfig.responseMimeType = 'application/json';
  }

  try {
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return res.status(geminiRes.status).json({ error: 'Gemini API error', detail: errText });
    }

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (text === undefined) {
      return res.status(500).json({ error: 'Gemini returned no usable content', raw: data });
    }

    if (json) {
      try {
        const parsed = JSON.parse(text);
        return res.status(200).json(parsed);
      } catch (parseErr) {
        return res.status(500).json({ error: 'Gemini did not return valid JSON despite being asked to', raw: text });
      }
    }

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: 'Request to Gemini failed', detail: err.message });
  }
}
