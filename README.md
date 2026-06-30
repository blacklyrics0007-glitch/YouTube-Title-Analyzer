# 🎯 Best YouTube Title Analyzer

A free, fast, fully client-side **YouTube Title Analyzer** that helps creators crack the
algorithm: find **low-competition keywords**, study **top-ranking videos**, score your
title's SEO, and build the perfect **curiosity gap** to skyrocket your CTR.

> Competitor Analysis · Low Competition Keywords · Video Comparison

![Dark, modern, responsive UI](https://img.shields.io/badge/UI-Dark%20%2B%20Responsive-25e398) ![No build step](https://img.shields.io/badge/Build-None%20(vanilla%20JS)-4aa3ff)

---

## ✨ Features

| Feature | Works offline | Needs API key |
|---|:---:|:---:|
| **SEO Score (0–100)** with explainable insights | ✅ | |
| **Keyword extraction** — Short (1 word), Long (2 words), Phrases (3+ words) | ✅ | |
| **Hashtags (Top 5)** | ✅ | |
| **Title insights** (length, front-loaded keyword, numbers, curiosity gap, power words, clickbait check) | ✅ | |
| **Low-Competition Keywords** (rare-usage gap analysis vs. top results) | heuristic | ✅ accurate |
| **Trending Keywords** (most-used terms across ranking videos) | heuristic | ✅ live |
| **Video Comparison** (top videos with views/likes, 3 / 6 / 12-month filter) | | ✅ |
| **Copy buttons** + click-to-copy chips | ✅ | ✅ |

The app runs a **full local analysis with no key required**. Adding a free YouTube
**Data API v3** key unlocks live competition data, trending keywords pulled from real
ranking videos, and the video comparison panel.

---

## 🧠 How the SEO score works

The score is **deterministic and explainable** — not a black box. Points are awarded for:

- **Length 50–70 chars** (mobile-safe, no truncation) — 22 pts
- **Front-loaded primary keyword** (first 30 chars) — 20 pts
- **Power / emotional words** (proven, easy, best…) — 14 pts
- **A number / data point** (e.g. "5 Ways", "2026") — 12 pts
- **Curiosity gap** via `(brackets)` — 12 pts
- **Balanced word count** (6–12 words) — 10 pts
- **Clean capitalisation** (no spammy ALL-CAPS) — 10 pts

Each rule shows a ✓ / ⚠ / ✕ tip so you know exactly how to improve the title.

---

## 🚀 Usage

1. Open `index.html` (or the live GitHub Pages site).
2. *(Optional)* Paste a **YouTube Data API v3** key, pick your target **country**, and click **Save Key**.
3. Type a video title and hit **Analyze**.
4. Copy the keyword gaps, hashtags, and study the top-ranking videos.

### Get a free API key
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project → **Enable APIs & Services** → enable **YouTube Data API v3**.
3. **Credentials → Create credentials → API key**, then paste it into the tool.

> The key is stored **only in your browser's `localStorage`** — it is never sent anywhere
> except directly to Google's official API.

---

## 🛠 Tech

- **Vanilla HTML + CSS + JS** — zero dependencies, no build step.
- Calls the official `googleapis.com/youtube/v3` endpoints (`search`, `videos`) from the browser.
- Deploys anywhere static (GitHub Pages, Netlify, Vercel, or just open the file).

## 📂 Structure

```
index.html   # markup / layout
styles.css   # dark, responsive theme
app.js       # analysis engine + API integration
```

## ⚖️ Notes & limits

- Offline "low-competition" / "trending" results are heuristic estimates; live mode uses real ranking data.
- YouTube API has a daily quota (`search` ≈ 100 units/call). One analysis ≈ ~200 units.

---

Built for creators who are done shouting into the void. Find the gap, build the hook, win the click.
