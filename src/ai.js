// Hybrid inference through Firebase AI Logic.
// On-device Gemini Nano (Chrome Prompt API) when available, otherwise the
// cloud model falls back automatically via InferenceMode.PREFER_ON_DEVICE.
// Docs: https://firebase.google.com/docs/ai-logic/hybrid-on-device-inference
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from "firebase/app-check";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
} from "firebase/ai";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);

// App Check needs a provider object: initializeAppCheck throws without one
// ("Cannot read properties of undefined (reading 'initialize')"), which
// kills this whole module and leaves every button on the page dead.
// Production provider: reCAPTCHA Enterprise (Fraud Defense, free tier),
// site key created 2026-11-17 for maodou-companion.web.app /
// maodou-companion.firebaseapp.com / localhost. The Classic reCAPTCHA v3
// key (6Le12iQu...) can no longer be registered: Firebase console disabled
// its form on 2026-11-17 ("reCAPTCHA Classic 已弃用"), so the app was
// re-registered with Enterprise and the client switched providers the
// same day. Do not switch back to ReCaptchaV3Provider.
const RECAPTCHA_SITE_KEY = "6LdpEyQuAAAAADdEAPnXEwBWTBOm5Faw8Oqb8OHv";

// Debug provider only for local development: the console prints a debug
// token on first run; register it under Firebase console > App Check > Apps
// > Manage debug tokens. Never enabled on the live site: every visitor's
// browser would mint an unregistered token and App Check would reject it.
if (
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1"
) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}
const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});

/** TEMPORARY diagnostic for the 401 investigation — remove before submission.
 * Forces a fresh App Check token fetch and reports whether the reCAPTCHA
 * script loaded and what getToken() returned. */
export async function diagnoseAppCheck() {
  const info = {
    grecaptcha: typeof window.grecaptcha,
    enterprise: typeof window.grecaptcha?.enterprise,
  };
  try {
    const t = await getToken(appCheck, true);
    return { ...info, ok: true, tokenPrefix: t.token.slice(0, 12) };
  } catch (err) {
    return { ...info, ok: false, error: String(err?.message || err) };
  }
}

const ai = getAI(app, { backend: new GoogleAIBackend() });

// Cloud fallback model: gemini-3.7-flash (stable, no billing required).
// Model history (2026-11-17): gemini-3.8-flash is the current model, but
// every generateContent call through the AI Logic gateway timed out with 503
// "Deadline expired" (5 attempts over ~30 min, 2-5 min each). gemini-2.5-flash
// returns 404 "no longer available to new users". 3.7-flash is the previous
// GA Flash; trying it to see if the 503 is specific to 3.8-flash.
export const model = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  inCloudParams: { model: "gemini-3.7-flash" },
});

let deviceInitStarted = false;

/** Must be called from a user gesture, before the first generate call. */
export async function initDeviceModel(onProgress) {
  if (deviceInitStarted) return;
  deviceInitStarted = true;
  await model.initializeDeviceModel((v) => onProgress && onProgress(v));
}

/** True when Chrome's on-device model is available on this device. */
export async function isOnDeviceAvailable() {
  try {
    if (!globalThis.LanguageModel?.availability) return false;
    const state = await globalThis.LanguageModel.availability();
    return state === "available" || state === "downloading" || state === "downloadable";
  } catch {
    return false;
  }
}

/**
 * Single-turn generation (on-device inference does not support multi-turn
 * chat, so every call packs its full context into one prompt).
 * Returns { text, onDevice } where onDevice is our best read of which path
 * ran: true when Chrome reports an on-device model available, because
 * PREFER_ON_DEVICE routes there first.
 */
export async function generate(prompt) {
  const onDevice = await isOnDeviceAvailable();
  const result = await model.generateContent(prompt);
  return { text: result.response.text(), onDevice };
}

/** Ask for JSON only; falls back to raw text when parsing fails. */
export async function generateJSON(prompt) {
  const { text, onDevice } = await generate(prompt + "\n\nReply with JSON only, no other text.");
  try {
    return { data: JSON.parse(text), onDevice };
  } catch {
    return { data: null, raw: text, onDevice };
  }
}
