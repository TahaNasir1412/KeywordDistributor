# Keyword Distribution Workbench — Complete Reference

Kept up to date as the tool changes. This is the "look here for the full picture" document — what's in the package, how it's deployed, exactly how every decision (Primary/Secondary/Tertiary, meta generation, heading optimization) actually gets made, the Gemini backend specifics, and a running log of real bugs found and fixed so the reasoning behind current behavior isn't lost.

Live deployment: `keyword-distributor.vercel.app`

---

# PART 1 — What's in this package

```
deploy_package/
├── api/
│   └── generate.js       <- Vercel serverless function. Holds your Gemini key. Never touches the browser.
├── public/
│   └── index.html        <- The tool itself.
├── package.json
├── vercel.json
└── .gitignore
```

Your Gemini key lives in exactly one place — Vercel's environment variables, read only by `api/generate.js`. The browser never sees it. Every place the tool needs AI, it calls a small wrapper (`getSample()` in `index.html`) that checks whether it's running inside Claude (uses Claude's own connection) or self-hosted (calls `/api/generate`, which talks to Gemini). Nothing else in the tool's logic changes based on which backend answers — same rules, same prompts, same validation either way.

---

# PART 2 — Step-by-step deployment (already done, kept for reference / redeploying elsewhere)

1. **Get a Gemini key:** https://aistudio.google.com/apikey → Create API key
2. **Push this folder to GitHub** as its own repo (structure must stay exactly as shown above — `api/` and `public/` at the top level)
3. **Import into Vercel** (https://vercel.com/new), but don't deploy yet
4. **Add the key** under Environment Variables: name `GEMINI_API_KEY`, value = your actual key, checked for all three environments
5. **Deploy.** Vercel gives you a live URL.

**For any future change:** replace the relevant file's content in your local repo, then `git add . && git commit -m "..." && git push`. Vercel auto-redeploys within about a minute.

---

# PART 3 — How the tool actually operates

## The core design principle
Everything **countable** (character limits, word counts, occurrence counts, density, budget math) is computed in plain JavaScript — never trusted from an AI's own claim. Everything requiring **judgment** (is this keyword branded, does this heading topic fit this keyword, is this sentence natural) goes through an AI call. This split exists because early versions that let the AI "do the math in its head" produced wrong density calculations and wrong citations.

## Step 1 — Keyword grouping

1. **You paste** a raw `keyword, volume` list.
2. **Branding check (AI, one call per batch of 35 keywords):** every single keyword is evaluated independently for whether it reads as a specific competitor's business name versus a generic search. There is no pre-supplied brand list anymore — the AI decides purely on its own judgment (this was a deliberate change; an earlier version used exact-text matching against a user-typed brand list, which caused real over-matching bugs — see Part 5). Flagged keywords are shown with the model's stated reasoning and a confidence level; nothing is removed automatically. You confirm or override every flag via clickable cards, or skip the check entirely with one button.
3. **Volume grouping (pure JavaScript, zero AI):** remaining keywords are grouped by exact volume tie, sorted highest to lowest. Highest group → Primary. Next → Secondary. Next → Tertiary. Everything else → related/off-page pool.
   - **Note on scope:** this replaced an earlier "Bucket A vs Bucket B" SERP-based distinction from the original SOP, at explicit request, because it's simpler and more predictable. The trade-off: a genuinely distinct keyword (like a "near me" query) that happens to tie in volume with unrelated keywords lands in the same group by default. You handle that through manual override (Step 4 below), not automatic detection.
4. **Picking the "most natural" phrase within each group (AI):** the AI's only job here is choosing which group member reads best out loud. It cannot move keywords between groups or invent new ones — group membership is fixed by the JavaScript step above before the AI ever sees it.
5. **Editing:** a plain-text box lets you rearrange keywords between tiers by literally moving lines, or you can type a plain-English instruction ("move the two near me keywords into their own tertiary group") and have the AI restructure — either way, a completeness check flags anything left unaccounted for, and the "confirm and continue" button always works even if something's flagged (it asks first, never hard-blocks).

## Step 2 — Meta title and description

1. **Titles generate first** (3 options). Character limit is a **hard ceiling — 60 characters, never exceeded, no exceptions.** Within that ceiling, the AI tries hard to fit both a Primary and Secondary variant, checking first whether Secondary already contains Primary as a substring (the "combine" trick — one phrase satisfies both keyword requirements and costs fewer characters). If both genuinely can't fit under 60, Primary is kept (mandatory) and Secondary sits out that specific option — this is shown to you plainly with a "try the shortest possible combination" retry option, not silently forced past the limit.
2. **Once you pick a title, descriptions generate** (3 options) knowing exactly which Primary/Secondary variant your title used, explicitly told to use different ones. Description limit is a hard ceiling at **150 characters** (updated from an earlier 140).
3. **Live keyword tracker (right sidebar):** every Primary/Secondary/Tertiary variant is listed; the moment you click a title or description option, any keyword it contains gets struck through with a note on exactly where it was used — updates instantly as you switch selections, before you've even finalized anything.
4. **Refine with feedback:** after selecting a title or description, a box lets you type a specific tweak ("add same-day before the keyword") and get that one option revised while the character-limit and keyword rules stay enforced — not just a blind regenerate.
5. **Optional competitor analysis:** paste 1-3 competitor titles/descriptions, and generation studies their structure/emphasis to find a gap, explicitly instructed not to copy wording.
6. **Finalize** locks in your exact selection, which then feeds into Step 3.

## Step 3 — Heading optimization

1. **You paste** a rough heading outline (`#`/`##`/`###`) and a target word count.
2. **Budget (pure JavaScript):** `computeBudget()` implements the exact scaling formula from the original notes — 2 Primary / 1 Secondary body mentions baseline at 500 words, +1 to each per additional 500 words, Tertiary unlocked in the body only past 1,000 words.
3. **AI assigns keywords to headings:** exactly one Primary-bearing H1, one Secondary-bearing H2, one Tertiary-bearing H3 (matched to whichever heading's topic genuinely fits), remaining budget distributed to headings where it makes topical sense. If there are fewer distinct variants than the budget calls for, the AI is explicitly told reusing a variant across different headings/sentences is correct and expected — it should never invent phrasings that don't exist.
4. **Your heading text can never come back changed.** This is enforced by code, not just requested in the prompt: after the AI responds, your original heading text is parsed and force-restored by position, regardless of what the model returned. If the model tried to reword a heading, you're told exactly how many got restored. If the model ever returns a different *number* of headings than you gave it, you get an explicit warning instead of a silent mismatch.
5. **Keyword validation:** every `keyword_used` value the AI returns is checked against your actual locked keyword list before being trusted — a phrase that doesn't match exactly is rejected and flagged, never silently accepted as "close enough."
6. **The same tracker** now also reflects heading assignments alongside title/description, all in one place.
7. **Copy-ready output:** a text box with your exact headings plus a `[KEYWORD NOTE: ...]` line under each one that needs a specific variant — copy-to-clipboard button included.
8. **Refine with feedback:** describe a correction ("move the tertiary keyword to the FAQ, not pricing") and it re-runs respecting both your correction and the original budget/rules.

## Step 4 — Content audit

1. Paste your finished written content.
2. Real word count is computed, and the budget is recalculated from *that* — if your page grew past what was planned, the budget grows with it.
3. Every planned heading assignment is checked against what you actually wrote, with real occurrence counts (not a guess).
4. A full tracker (all Primary/Secondary/Tertiary variants, found/not-found, occurrence count) is shown, not just a summary.
5. If your real length unlocks more room than you've used, the AI is given your actual content and asked to name a specific existing section that could absorb one more mention, with an example sentence — or say honestly that nothing fits.

---

# PART 3.5 — Worked scenarios (the exact formulas, with numbers)

This section exists specifically so a future question like "wait, what happens when..." has a concrete, already-worked answer instead of needing to re-derive it from the code.

## Scenario: combining Primary and Secondary (title AND description)

**Rule:** before writing them out separately, always check whether the Secondary variant already contains the Primary variant as a substring. If it does, using the Secondary phrase alone satisfies both requirements — costs fewer characters and reads more naturally than stapling two phrases together.

**Worked example:**
- Primary: `"appliance repair flagstaff"`
- Secondary: `"appliance repair flagstaff az"`
- Secondary contains Primary in full → the title uses `"appliance repair flagstaff az"` once, not `"appliance repair flagstaff | appliance repair flagstaff az"`.

**This applies in both places it can:**
- **Title:** checked automatically before generation (Step 2, rule 3 in the code's prompt).
- **Description:** the same check applies when a description naturally includes Secondary — the code doesn't force separate mentions if one variant already contains the other.

## Scenario: forcing Secondary into the description when it wasn't used naturally

If none of the 3 generated descriptions include Secondary, there's a "try to fit secondary in naturally" button. This runs under **hard, non-negotiable rules**, not a loose retry:
1. Exactly **one** Secondary variant, never two.
2. Primary must still be present — the rewrite is not allowed to drop Primary to make room for Secondary.
3. It must be a **different** Secondary variant than whichever one the title already used (checked and named explicitly in the prompt sent to the AI).
4. Stay at 150 characters, never more.
5. **Verified after generation, not just requested:** the code counts how many Secondary variants actually appear in the result and confirms Primary is still there. If the rewrite broke rule 1 or 2, it's **rejected outright** and your original description is kept — you get a red banner telling you exactly which rule broke, rather than a silently-accepted bad rewrite.

## Scenario: reusing variants when you only have a few (the "small pool" case)

**Your example, worked through exactly:** say Primary has only 3 total phrasings (1 main + 2 variants). Title uses one, description uses a different one, H1 uses the third. Now the page is long enough that the body budget calls for 2 more Primary mentions. There are no "unused" variants left — every one has already appeared somewhere.

**What happens:** this is explicitly allowed and expected, not an error. The rule given to the AI: *"If there are fewer distinct variants than the budget calls for, reuse the same variant more than once — just make sure each use gets a genuinely different sentence, never the identical sentence repeated."* So the tool will reuse one of the same 3 phrasings again in the body, written into a new, different sentence than wherever it was used before. It will never invent a 4th phrasing that doesn't exist on your locked list just to avoid a repeat.

**Where this logic lives:** Step 3 (heading optimization) states this rule explicitly in the prompt. Step 4 (content audit) follows the same principle in reverse — if your actual word count unlocks more budget than you've used, it looks for a genuine unused variant first, and only suggests reusing an already-used one if that's genuinely all that's left, always naming which section could take it and writing an example sentence.

## Scenario: the budget formula itself, with real numbers

`computeBudget(wordCount)`:
- **500 words (baseline):** Primary 2x in body, Secondary 1x, Tertiary 0x (H3 heading only)
- **1,000 words:** Primary 3x, Secondary 2x, Tertiary unlocked — 1x in body, in addition to its H3
- **1,500 words:** Primary 4x, Secondary 3x, Tertiary 1x
- **2,000 words:** Primary 5x, Secondary 4x, Tertiary 1x

The rule that never changes regardless of length: this counts **distinct occurrences of the keyword concept**, spread across different phrasings where possible — never the same repeated sentence, and never inventing extra keyword density just because the page got longer. Growing content should mean deeper topical coverage, not a higher literal keyword count for its own sake.

---



## Why there's a list of models, not one name
Google has been retiring Gemini model names unusually fast. `gemini-2.0-flash` and `gemini-2.0-flash-lite` — the models originally used here — were both shut down June 1, 2026, less than a year after release. To avoid this breaking the tool silently again, `api/generate.js` tries a short ordered list of models and uses the first one that actually responds, rather than hardcoding one name.

## Free tier vs. preview models
As of 2026, Gemini's newest "-preview"-tagged models require a **paid tier** (billing enabled on the Google Cloud project) — a free AI Studio key will get an access error on them. The candidate list is ordered to try confirmed **free-tier-stable** models first (`gemini-2.5-flash` / `gemini-2.5-flash-lite`), then newer GA models, and only falls back to preview-tagged models last, in case billing ever gets enabled. If Google's lineup changes again, check `ai.google.dev/gemini-api/docs/models` and update the `modelCandidates` array in `api/generate.js`.

## Token limits
Output is capped at `maxOutputTokens: 4096`. This was raised from an initial 2048 after heading-optimization calls (which return one full object per heading) started truncating mid-response on pages with many headings — a cut-off response becomes invalid JSON, which surfaced as a 500 error. If a similar error recurs, the response body now says explicitly whether it looks truncated versus some other kind of malformed output — check the browser console for that detail before assuming it's the same cause twice.

## Diagnosing a live failure
Open the browser console (F12 → Console) when something fails and read the actual error `detail`/`raw` field in the response — the API is built to say specifically what went wrong (which model failed, whether output was cut off, whether the key is missing) rather than a bare "error." That detail is the single most useful thing to bring back for a real fix.

---

# PART 5 — Real bugs found and fixed (kept for context, not just curiosity)

- **CSS strikethrough bleeding into captions:** an ancestor element's `text-decoration: line-through` was drawing through child text even when the child set `text-decoration: none` — a genuine CSS quirk, not a logic bug. Fixed by wrapping only the keyword text itself in its own `<span>`.
- **Tracker showing completely blank:** a tier object missing a `tertiary` key (which happens naturally when there's no real third volume tier) caused `t.tertiary.main` to throw mid-render, aborting the entire sidebar update silently. Fixed with a `normalizeTiers()` guarantee applied everywhere tiers get set, plus a full try/catch in the render function that now shows the actual error text instead of nothing.
- **Retry/confirm buttons silently not working:** interactive elements (buttons, checkboxes) nested inside a `<label>` alongside another control triggered browser click-forwarding conflicts. Fixed by moving to plain clickable `<div>` cards throughout, never nesting a button inside a label with another interactive sibling.
- **Keyword parser silently misreading volume:** pasting a 3-column line (keyword, volume, leftover tier label from manual notes) caused the parser to read the label as the volume, failing silently to `0`. Fixed by scanning for the actual numeric token instead of blindly trusting column position.
- **Description rewrites dropping Primary or duplicating Secondary:** the "fit secondary in naturally" retry prompt didn't reference what the title already used or explicitly cap secondary at one mention, so the model sometimes used two secondary variants and zero primary. Fixed with an explicit prompt constraint plus a post-generation JavaScript check that rejects and reverts a rewrite if it breaks either rule.
- **Heading text getting reworded:** nothing in the original prompt guaranteed the AI would echo heading text back unchanged. Fixed with an explicit instruction plus a hard JavaScript restoration step (Part 3, Step 3.4 above).
- **Gemini model names retiring:** covered in Part 4.

---

# PART 6 — Getting future help

Describe what's wrong, and when something fails live, paste the exact browser console error (F12 → Console). That single piece of information is what turns "guess and patch" into "diagnose and fix" — every real bug found in this project so far was solved that way, not by re-reading code and assuming.
