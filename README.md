# Maodou Companion · 毛豆陪伴

A daily companion web app for children who struggle with school avoidance
or low motivation. Ten minutes a day: mood check-in → micro-task → leveled
reading → a one-line brief for parents.

Built for **#BuildHybridAI 2026** (Google / Firebase).

## Why hybrid inference matters here

A child's daily words about how they feel are the most sensitive data in
this app. When Chrome's on-device model is available, **those words never
leave the device**: Gemini Nano answers the check-in, the task and the
reading questions locally. When no on-device model is available, the same
single-turn calls fall back to a cloud Gemini model, so the app works on
any device. The app shows a live badge — 🌱 on-device / ☁️ cloud — so you
can always see which path answered.

## How it is built

- **Firebase AI Logic** (`firebase/ai`) with `InferenceMode.PREFER_ON_DEVICE`
  - On-device: Gemini Nano via Chrome's Prompt API (Chrome 139+ on desktop)
  - Cloud fallback: `gemini-3.8-flash` via the Gemini Developer API (free tier)
- **Firebase App Check** enforced (debug provider for local development and
  for this submission; debug tokens are accepted by the contest rules)
- **Vite** + vanilla JS, bilingual UI (English / 中文）
- Daily records live in `localStorage` only — nothing about the child is
  uploaded anywhere.

Every AI call is a **single-turn** `generateContent()` with its full context
packed into one prompt, because on-device inference does not support
multi-turn chat. Prompts are distilled from the Maodou Companion Skill
methodology （《毛豆小课堂》: "Catch them first, then move forward
together" — acknowledge, never judge; praise behavior, never labels;
briefs mention progress only, never tattle).

## Run it locally

```bash
npm install
npm run dev
```

You need your own Firebase project with AI Logic enabled, and a
`src/firebase-config.js` exporting your web app's `firebaseConfig`:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};
```

That file is gitignored on purpose: the repository contains no API keys.
On first run with App Check debug mode, the console prints a debug token —
register it under Firebase console → App Check → Apps → Manage debug
tokens.

On-device inference needs Chrome 139+ on desktop with the flag
`chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` enabled.
Without it, the app falls back to the cloud model automatically.

## Deploy

```bash
npm run build
npx firebase-tools deploy --only hosting
```

## What was built during the submission period

This web app is a new project created for #BuildHybridAI 2026 (Nov 17–30,
2026). It reuses content and methodology assets from the earlier
"Maodou Companion" Skill package (emotion check-in scripts, micro-task
templates, leveled reading lists, parent-brief templates, and the
《毛豆小课堂》 methodology) as prompt context and in-app copy; all
application code, the hybrid-inference integration and the UI were written
during the submission period.

## Boundaries

Maodou Companion offers no psychological diagnosis and never replaces
professional counseling. If risk signals appear, it suggests seeking a
professional.

## License

Apache-2.0 — see [LICENSE](LICENSE).
