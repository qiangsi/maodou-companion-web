import { initDeviceModel, isOnDeviceAvailable, generate, generateJSON, diagnoseAppCheck } from "./ai.js";
import { checkinPrompt, taskPrompt, praisePrompt, readPrompt, briefPrompt } from "./prompts.js";

const I18N = {
  zh: {
    appName: "毛豆陪伴",
    tagline: "每天 10 分钟，先接住，再一起往前走",
    profileTitle: "今天的孩子",
    profileHint: "只存在这台设备上，不会上传。",
    namePh: "孩子的小名",
    agePh: "年龄",
    startBtn: "开始今天的陪伴",
    s1Title: "1 · 情绪打卡",
    s1Hint: "选一个表情，再用一句话说说今天怎么样。只记录，不评判。",
    s1Ph: "今天……（一句话就好）",
    s1Btn: "毛豆听我说",
    s2Title: "2 · 微任务",
    s2Hint: "一个 10 分钟就能完成的小任务，跳一下就能够到。",
    s2Btn: "给我一个小任务",
    s2Done: "我完成了 ✓",
    s3Title: "3 · 分级阅读",
    s3Hint: "读一点，聊三个开放问题，保护好奇心。",
    s3Btn: "今天读什么",
    s4Title: "4 · 家长一句话简报",
    s4Hint: "只说今天的进步，不告状。",
    s4Btn: "生成今天的简报",
    footer: "毛豆陪伴不做心理诊断，不替代专业心理咨询。出现风险信号时，请寻求专业人士帮助。",
    footer2: "Built with Firebase AI Logic · on-device Gemini Nano when available, cloud Gemini fallback otherwise.",
    badgeOnDevice: "🌱 端侧 Gemini Nano · 你的话不出设备",
    badgeCloud: "☁️ 云端 Gemini · 端侧模型不可用时兜底",
    badgeChecking: "正在检查端侧模型…",
    needStart: "请先点「开始今天的陪伴」。",
    needFace: "请先选一个表情。",
    needTask: "请先领一个微任务。",
    working: "毛豆正在想…",
    modelDownloading: "端侧模型下载中 ",
    modelReady: "端侧模型就绪，今天的话可以不出设备。",
    modelCloud: "这台设备没有端侧模型，将使用云端 Gemini。",
  },
  en: {
    appName: "Maodou Companion",
    tagline: "10 minutes a day. Catch them first, then move forward together.",
    profileTitle: "Today's child",
    profileHint: "Stored only on this device, never uploaded.",
    namePh: "Child's nickname",
    agePh: "Age",
    startBtn: "Start today's companionship",
    s1Title: "1 · Mood check-in",
    s1Hint: "Pick a face, then one line about today. Only acknowledged, never judged.",
    s1Ph: "Today… (one line is enough)",
    s1Btn: "Tell Maodou",
    s2Title: "2 · Micro-task",
    s2Hint: "One small task, done in 10 minutes, reachable with a small stretch.",
    s2Btn: "Give me a small task",
    s2Done: "I did it ✓",
    s3Title: "3 · Leveled reading",
    s3Hint: "Read a little, talk about three open questions. Protect curiosity.",
    s3Btn: "What shall we read today",
    s4Title: "4 · One-line brief for parents",
    s4Hint: "Progress only, never tattling.",
    s4Btn: "Generate today's brief",
    footer: "Maodou Companion offers no psychological diagnosis and never replaces professional counseling. If risk signals appear, please seek a professional.",
    footer2: "Built with Firebase AI Logic · on-device Gemini Nano when available, cloud Gemini fallback otherwise.",
    badgeOnDevice: "🌱 On-device Gemini Nano · your words stay on this device",
    badgeCloud: "☁️ Cloud Gemini · fallback when no on-device model",
    badgeChecking: "Checking for the on-device model…",
    needStart: "Please tap “Start today's companionship” first.",
    needFace: "Please pick a face first.",
    needTask: "Please get a micro-task first.",
    working: "Maodou is thinking…",
    modelDownloading: "Downloading the on-device model ",
    modelReady: "On-device model ready — today's words can stay on this device.",
    modelCloud: "No on-device model on this device; using cloud Gemini.",
  },
};

let lang = "zh";
let started = false;
let face = "";
let currentTask = "";

const $ = (id) => document.getElementById(id);
const t = (k) => I18N[lang][k];

function profile() {
  return {
    name: $("childName").value.trim(),
    age: $("childAge").value.trim(),
    grade: $("childGrade").value,
  };
}

function dayRecord() {
  const key = "maodou-day-" + new Date().toISOString().slice(0, 10);
  const rec = JSON.parse(localStorage.getItem(key) || "{}");
  return { key, rec };
}
function saveDay(patch) {
  const { key, rec } = dayRecord();
  localStorage.setItem(key, JSON.stringify({ ...rec, ...patch }));
}

async function refreshBadge() {
  const badge = $("modeBadge");
  badge.textContent = t("badgeChecking");
  badge.className = "badge";
  const ok = await isOnDeviceAvailable();
  badge.textContent = ok ? t("badgeOnDevice") : t("badgeCloud");
  badge.className = "badge " + (ok ? "on-device" : "cloud");
  return ok;
}

function applyLang() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  $("langZh").classList.toggle("sel", lang === "zh");
  $("langEn").classList.toggle("sel", lang === "en");
  refreshBadge();
}

$("langZh").onclick = () => { lang = "zh"; applyLang(); };
$("langEn").onclick = () => { lang = "en"; applyLang(); };

$("faces").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-face]");
  if (!b) return;
  document.querySelectorAll("#faces button").forEach((x) => x.classList.remove("sel"));
  b.classList.add("sel");
  face = b.dataset.face;
});

$("initModel").onclick = async () => {
  const btn = $("initModel");
  btn.disabled = true;
  $("initStatus").textContent = t("working");
  try {
    await initDeviceModel((v) => {
      $("initStatus").textContent = t("modelDownloading") + Math.round(v * 100) + "%";
    });
    started = true;
    const ok = await refreshBadge();
    $("initStatus").textContent = ok ? t("modelReady") : t("modelCloud");
  } catch (err) {
    // On-device init failing must not block the cloud path.
    started = true;
    $("initStatus").textContent = t("modelCloud");
    console.warn("device model init failed, cloud fallback will be used", err);
  } finally {
    btn.disabled = false;
  }
};

function guardStarted() {
  if (!started) { alert(t("needStart")); return false; }
  return true;
}

$("goCheckin").onclick = async () => {
  if (!guardStarted()) return;
  if (!face) { alert(t("needFace")); return; }
  const mood = $("moodText").value.trim();
  const out = $("outCheckin");
  out.textContent = t("working");
  try {
    const { text } = await generate(checkinPrompt(lang, profile(), face, mood));
    out.textContent = text;
    saveDay({ face, mood });
  } catch (err) {
    out.textContent = String(err?.message || err);
  }
};

$("goTask").onclick = async () => {
  if (!guardStarted()) return;
  const out = $("outTask");
  out.textContent = t("working");
  try {
    const { data, raw } = await generateJSON(taskPrompt(lang, profile(), $("moodText").value.trim()));
    if (data) {
      currentTask = data.task;
      out.textContent = `${data.task}\n\n${data.why}\n${lang === "zh" ? "第一步：" : "First step: "}${data.firstStep}`;
      saveDay({ task: data.task });
    } else {
      currentTask = raw;
      out.textContent = raw;
    }
  } catch (err) {
    out.textContent = String(err?.message || err);
  }
};

$("doneTask").onclick = async () => {
  if (!guardStarted()) return;
  if (!currentTask) { alert(t("needTask")); return; }
  const out = $("outPraise");
  out.textContent = t("working");
  try {
    const { text } = await generate(praisePrompt(lang, profile(), currentTask));
    out.textContent = text;
    saveDay({ taskDone: true });
  } catch (err) {
    out.textContent = String(err?.message || err);
  }
};

$("goRead").onclick = async () => {
  if (!guardStarted()) return;
  const out = $("outRead");
  out.textContent = t("working");
  try {
    const { data, raw } = await generateJSON(readPrompt(lang, profile()));
    if (data) {
      out.textContent = `${data.book}\n${data.reason}\n\n${data.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
      saveDay({ book: data.book });
    } else {
      out.textContent = raw;
    }
  } catch (err) {
    out.textContent = String(err?.message || err);
  }
};

$("goBrief").onclick = async () => {
  if (!guardStarted()) return;
  const out = $("outBrief");
  out.textContent = t("working");
  try {
    const { rec } = dayRecord();
    const { text } = await generate(briefPrompt(lang, profile(), rec));
    out.textContent = text;
  } catch (err) {
    out.textContent = String(err?.message || err);
  }
};

applyLang();

// TEMPORARY diagnostic for the 401 investigation — remove before submission.
// Shows the App Check token-fetch result on the page so it can be read
// without DevTools.
setTimeout(async () => {
  const el = $("initStatus");
  try {
    const d = await diagnoseAppCheck();
    el.textContent = "AppCheck诊断: " + JSON.stringify(d);
  } catch (err) {
    el.textContent = "AppCheck诊断失败: " + String(err?.message || err);
  }
}, 3000);
