// Hybrid inference through Firebase AI Logic.
// On-device Gemini Nano (Chrome Prompt API) when available, otherwise the
// cloud model falls back automatically via InferenceMode.PREFER_ON_DEVICE.
// Docs: https://firebase.google.com/docs/ai-logic/hybrid-on-device-inference
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
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
// Production provider: reCAPTCHA v3 (free), site key created 2026-11-17 for
// maodou-companion.web.app / maodou-companion.firebaseapp.com / localhost.
const RECAPTCHA_SITE_KEY = "6Le12iQuAAAAAEg-vuUecUuPmgwIsh2rSpEjhV3k";

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
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});

const ai = getAI(app, { backend: new GoogleAIBackend() });

// Cloud fallback model: gemini-3.8-flash (stable, no billing required).
// Note: gemini-2.5-flash is deprecated; from 2026-12-01 the Gemini Developer
// API routes 2.5 Flash/Pro requests to newer models automatically.
export const model = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  inCloudParams: { model: "gemini-3.8-flash" },
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
