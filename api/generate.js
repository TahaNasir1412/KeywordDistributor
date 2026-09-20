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
  // frontier reasoning. IMPORTANT: Gemini 3.x models tagged "-preview" are paid-tier
  // only as of 2026 -- a free AI Studio key (no billing enabled) will get an access
  // error on those. So the order below tries confirmed free-tier-stable models
  // FIRST, then newer GA models, and only falls back to preview models last (in
  // case billing IS enabled on your project). If everything here is dead or wrong
  // by the time you read this, check ai.google.dev/gemini-api/docs/models.
  const modelCandidates = tier === 'quick'
    ? ['gemini-2.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview']
    : ['gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview'];

  const generationConfig = {
    maxOutputTokens: 2048, // caps runaway responses -- keeps cost predictable
  };
  if (json) {
    generationConfig.responseMimeType = 'application/json';
  }

  let lastError = null;
  for (const model of modelCandidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
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
        lastError = { status: geminiRes.status, detail: await geminiRes.text(), model };
        continue; // this model is unavailable/retired -- try the next one
      }

      const data = await geminiRes.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text === undefined) {
        lastError = { status: 500, detail: 'No usable content in response', model };
        continue;
      }

      if (json) {
        try {
          const parsed = JSON.parse(text);
          return res.status(200).json(parsed);
        } catch (parseErr) {
          return res.status(500).json({ error: 'Gemini did not return valid JSON despite being asked to', raw: text, modelUsed: model });
        }
      }

      return res.status(200).json({ text });
    } catch (err) {
      lastError = { status: 500, detail: err.message, model };
    }
  }

  // Every candidate model failed -- all of them are likely retired or misconfigured.
  return res.status(502).json({
    error: 'All candidate Gemini models failed. They may have been retired -- check ai.google.dev/gemini-api/docs/models for current names and update modelCandidates in this file.',
    lastError
  });
}
