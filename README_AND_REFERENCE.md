# Keyword Distribution Workbench — Deployment & Reference Guide

This is the complete reference for the tool: what's in the deployment package, how to put it live on your own GitHub + Vercel account with your Gemini key, how the tool actually works internally, and an honest check of where it does and doesn't match your original SOP and rough notes.

---

# PART 1 — What's in this package

```
deploy_package/
├── api/
│   └── generate.js       <- Vercel serverless function. Holds your Gemini key. Never touches the browser.
├── public/
│   └── index.html        <- The tool itself (same file you've been using inside Claude, adapted).
├── package.json
├── vercel.json
└── .gitignore
```

**Why this structure matters:** your Gemini key lives in exactly one place — Vercel's environment variables, read only by `api/generate.js`, which runs on Vercel's servers. The browser never sees it, so anyone you share the live link with (your team) can use the tool without ever being able to extract your key from the page source. This is the standard, correct pattern for any client-side app that needs a paid API behind it.

**How `index.html` was adapted:** every place the tool previously called `claude.use("sample")` now calls a small wrapper function that checks whether it's running inside Claude (in which case it still uses Claude's own connection) or self-hosted (in which case it calls `/api/generate` instead, which talks to Gemini). Nothing else in the 1,500+ lines of tool logic had to change — the keyword tiering, the meta generation, the heading optimizer, the tracker, the content audit — all identical either way. This is deliberate: whichever backend answers, the rules, prompts, and validation are exactly the same.

---

# PART 2 — Step-by-step deployment

## Step 1: Get a Gemini API key
1. Go to https://aistudio.google.com/apikey
2. Sign in with a Google account, click "Create API key"
3. Copy the key somewhere safe temporarily — you'll paste it into Vercel in Step 4, never into any file

## Step 2: Put this package on GitHub
1. Create a new empty repository on GitHub (no README, no license — empty)
2. On your own machine, in the `deploy_package` folder:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```
3. Refresh the GitHub page — you should see `api/`, `public/`, `package.json`, `vercel.json`

## Step 3: Import the repo into Vercel
1. Go to https://vercel.com/new
2. Since you already have GitHub connected, find your new repo in the list and click "Import"
3. Vercel will auto-detect it as a static site with serverless functions — leave the default settings, do **not** click Deploy yet

## Step 4: Add your Gemini key to Vercel (before deploying)
1. On the import screen (or later under Project Settings → Environment Variables), add:
   - Name: `GEMINI_API_KEY`
   - Value: the key you copied in Step 1
   - Environment: all three (Production, Preview, Development)
2. Now click **Deploy**

## Step 5: Confirm it's live
1. Vercel gives you a URL like `your-repo-name.vercel.app`
2. Open it — you should see the Keyword Distribution Workbench exactly as it looks now
3. Run a real keyword list through Step 1 — if it correctly analyzes and assigns tiers, the Gemini connection is working end to end

## Making a future change
Whenever you want to update anything (including any fix I give you going forward): I'll give you the updated file content, you replace the file in your local repo, then:
```
git add .
git commit -m "describe the change"
git push
```
Vercel automatically redeploys within about a minute of the push — no manual redeploy step needed.

---

# PART 3 — How the tool actually operates (technical walkthrough)

## The core design principle
Everything that is **countable** (character limits, word counts, occurrence counts, density, budget math) is computed in plain JavaScript — never trusted from an AI's own claim. Everything that requires **judgment** (is this keyword branded, does this heading topic fit this keyword, is this sentence natural) goes through an AI call. This split exists because early versions of this tool that let the AI "do the math in its head" produced wrong density calculations and wrong citations — the same failure mode shows up in language models generally, not just this one.

## Step 1 — Keyword grouping
1. You paste a raw list of `keyword, volume` pairs.
2. **Branding check (AI):** every keyword is individually evaluated for whether it reads as a specific competitor's business name versus a generic search — batched in groups of 35 so even a 100+ keyword list gets every item checked, none skipped. Flagged items are shown to you with the model's reasoning; nothing is auto-removed. You confirm or override each one.
3. **Volume grouping (pure JavaScript, no AI):** the remaining keywords are grouped by exact volume, sorted highest to lowest. The top group becomes Primary, next becomes Secondary, next becomes Tertiary, everything else goes to a related/off-page pool.
4. **Picking the "most natural" phrase within each group (AI):** given the groups (already fixed by the code, not up for reinterpretation), the AI's only job is choosing which member of each group sounds most natural to lead with.
5. You can hand-edit the result directly (a plain-text box: move any keyword to a different tier by literally moving the line) or describe a change in plain English and have the AI restructure accordingly — either way, nothing is dropped without your explicit action, and a completeness check flags anything unaccounted for.

## Step 2 — Meta title and description
1. Titles are generated first (3 options), each required to contain a Primary and a Secondary variant, prioritizing keyword inclusion over the 60-character guideline if the two genuinely conflict.
2. Once you pick a title, descriptions are generated *knowing which exact variant your title used*, explicitly told to use a different one — this is what prevents the same phrasing from appearing twice.
3. A live sidebar shows every keyword variant, struck through the moment it appears in your current selection, with a note on exactly where (title, description).
4. You can request a specific tweak on either ("add same-day before the keyword") rather than only being able to regenerate blind or pick from the fixed options.
5. Optional: paste competitor titles/descriptions, and the generation step studies their structure and emphasis to find a gap to write toward — explicitly instructed not to copy their wording.

## Step 3 — Heading optimization
1. You paste a rough heading outline and a target word count.
2. The word count determines a budget (plain math: 2 Primary / 1 Secondary body mentions baseline at 500 words, +1 to each per additional 500 words, Tertiary unlocked in the body only past 1,000 words) — this is the exact formula from your original notes, computed in code, not estimated by the AI.
3. The AI assigns exactly one Primary-bearing H1, one Secondary-bearing H2, one Tertiary-bearing H3 (matched to whichever heading's topic genuinely fits that keyword), and distributes remaining budget across other headings where it makes topical sense — every assignment is returned as a structured field and checked against your real keyword list before being trusted, not extracted by guessing at the AI's phrasing.
4. The same sidebar tracker now also reflects heading assignments, alongside title/description.
5. A copy-ready text block is generated with a `[KEYWORD NOTE: ...]` line under every heading that needs one, ready to paste back into your document.
6. You can describe a correction ("move the tertiary keyword to the FAQ, not the pricing section") and it re-runs respecting both your correction and the original budget.

## Step 4 — Content audit
1. Paste your finished, written content.
2. Real word count is computed, and the budget is recalculated from *that* — if your page grew past what was planned, the budget grows with it.
3. Every planned heading assignment is checked against what you actually wrote — a real occurrence count, not a guess.
4. If your real length unlocks more room than you've used, the AI is given your actual content and asked to name a specific existing section that could absorb one more natural mention, with an example sentence — or to say honestly that nothing fits, rather than forcing it in.

---

# PART 4 — Honest compliance check against your original SOP and rough notes

Going through your original Phase 1 checklist and raw notes point by point, flagging matches and one real, intentional deviation.

| Original rule | Current tool behavior | Status |
|---|---|---|
| One keyword, one page, never reused across pages | Not automated — the tool handles one page at a time and has no cross-page memory | **Not enforced by the tool.** This stays your responsibility when working across multiple pages of a site. |
| Split into Bucket A (same search, different wording, judged by SERP overlap) vs Bucket B (genuinely different search) | **Removed.** Current tool groups purely by exact volume match — any keywords tying on volume are treated as one group, with no SERP judgment involved | **Intentional deviation, at your explicit instruction** a few turns back ("don't check the SERP, I'll verify it — just check whether the volume is same"). This is simpler and more predictable, but it means a genuinely distinct keyword (like a "near me" query) that happens to tie in volume with unrelated keywords will land in the same group by default — you handle that through the manual override, not automatic detection. Worth knowing this is a real trade-off, not a bug. |
| Pick most natural phrasing when keywords tie on volume | AI picks the most natural phrase within each code-determined group | **Matches.** |
| Client's stated primary overrides everything | Supported via manual edit and freeform correction | **Matches**, though not automatically detected — you'd need to type the override rather than the tool recognizing "client said so" language. |
| Secondary/Tertiary from Bucket B by volume, or your judgment if no real volume | Secondary/Tertiary = next volume groups down, full stop (no Bucket B distinction since that step was removed) | **Consistent with your simplified rule**, not with the original document's Bucket A/B version. |
| Title = Primary + Secondary, containment trick when one contains the other | Both implemented directly in the prompt and explained to the model | **Matches.** |
| Meta description = different Primary phrasing, Secondary only if natural | Implemented, plus now explicitly told to avoid whatever exact variant the title already used | **Matches and slightly exceeds** the original rule's precision. |
| H1 = different Primary phrasing than title | Implemented in the heading optimizer's rules | **Matches.** |
| H2 = Secondary once, H3 = Tertiary once, nowhere else unless 1,000+ words | Implemented exactly, with the budget computed in code | **Matches.** |
| Use the exact phrase, never reword | Enforced twice: instructed in every prompt, then verified against your actual keyword list afterward — a phrase that doesn't match exactly is rejected, not silently accepted | **Matches, and automated in a way the original manual process wasn't.** |
| Density ceiling ~0.4%, scaling formula for longer pages | `computeBudget()` implements the exact 2/1/0 baseline + per-500-word scaling from your notes | **Matches.** |
| Final checklist before publishing | Step 4's audit covers keyword usage and budget vs. real length; it does not separately re-verify title/description character limits or Bucket A/B sorting (since that step no longer exists) | **Partial** — covers the on-page usage checks, not the pre-publish formatting checks, since those are already validated live during Step 2. |

**The one thing worth deciding, if it matters to you:** do you want the original Bucket A/B (SERP-based) distinction restored as an *optional* extra layer on top of the current volume-only grouping — something you could toggle on for a keyword list where you specifically want that finer judgment? Right now the tool only does what you last asked for. Say the word and I'll add it as a choice rather than a replacement.

---

# PART 5 — Getting future help

Once this is live on your own domain, anything that needs fixing works the same way it has in this conversation: describe what's wrong, and if useful, paste the exact browser console error (F12 → Console tab) when something misbehaves — that's the single most useful piece of information for finding a real bug fast rather than guessing. I'll give you the updated file content to paste back into your repo, and the `git add / commit / push` cycle above handles the rest.
