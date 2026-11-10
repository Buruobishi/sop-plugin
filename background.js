importScripts("db.js", "describe.js");

const MAX_STEPS = 100;
let guide = emptyGuide();
let ready = null;
let lastNav = { url: "", at: 0 };
let captureChain = Promise.resolve();

function isWebUrl(url) {
  return Boolean(url && (url.startsWith("http://") || url.startsWith("https://")));
}

async function init() {
  if (!ready) {
    ready = loadGuide()
      .then(async function (saved) {
        guide = saved;
        if (guide.recording) await injectAll();
        syncBadge();
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});
      });
  }
  return ready;
}

function syncBadge() {
  if (guide.recording) {
    chrome.action.setBadgeBackgroundColor({ color: "#c2410c" });
    chrome.action.setBadgeText({ text: String(guide.steps.length || "●") });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

function broadcast(message) {
  chrome.runtime.sendMessage(message).catch(function () {});
}

async function persist() {
  await saveGuide(guide);
  syncBadge();
  broadcast({ type: "GUIDE", guide: guide });
}

function blobToDataUrl(blob) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () {
      resolve(reader.result);
    };
    reader.onerror = function () {
      reject(reader.error);
    };
    reader.readAsDataURL(blob);
  });
}

function drawClick(ctx, width, height, xPct, yPct) {
  if (xPct == null || yPct == null) return;
  const x = (xPct / 100) * width;
  const y = (yPct / 100) * height;
  const radius = Math.max(16, Math.round(Math.min(width, height) * 0.028));
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius + 10, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(234, 88, 12, 0.28)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "#ea580c";
  ctx.lineWidth = Math.max(4, Math.round(radius * 0.24));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, Math.max(4, radius * 0.2), 0, Math.PI * 2);
  ctx.fillStyle = "#ea580c";
  ctx.fill();
  ctx.restore();
}

function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const mime = (header.match(/^data:([^;,]+)/) || [])[1] || "image/png";
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function shrink(dataUrl, xPct, yPct) {
  const blob = dataUrlToBlob(dataUrl);
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 1440 / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  drawClick(ctx, width, height, xPct, yPct);
  const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.72 });
  bitmap.close();
  return blobToDataUrl(jpeg);
}

async function captureTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  if (chrome.tabs.captureTab) {
    try {
      return await chrome.tabs.captureTab(tab.id, { format: "png" });
    } catch (error) {}
  }
  return chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
}

async function shotOf(tabId, xPct, yPct) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab || tab.windowId == null || !isWebUrl(tab.url)) {
        return { image: null, error: "当前标签不是普通网页，无法截图" };
      }
      const png = await captureTab(tab);
      if (!png) throw new Error("浏览器没有返回截图");
      try {
        return { image: await shrink(png, xPct, yPct), error: "" };
      } catch (drawError) {
        return { image: png, error: "" };
      }
    } catch (error) {
      lastError = error;
      await new Promise(function (resolve) {
        setTimeout(resolve, 200);
      });
    }
  }
  const message = String(lastError && lastError.message ? lastError.message : lastError);
  return {
    image: null,
    error: /all_urls|activeTab|permission|access/i.test(message)
      ? "没有截图权限。打开 chrome://extensions，进入本插件详情，把网站访问权限改成「在所有网站上」，然后重新加载插件。"
      : message,
  };
}

async function addStep(partial, tabId) {
  if (!guide.recording) return;
  if (guide.steps.length >= MAX_STEPS) {
    broadcast({ type: "LIMIT", max: MAX_STEPS });
    return;
  }
  const shot = tabId
    ? await shotOf(tabId, partial.xPct, partial.yPct)
    : { image: null, error: "没有对应的网页标签" };
  const step = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts: Date.now(),
    kind: partial.kind,
    text: partial.text || describeStep(partial),
    note: partial.note || "",
    url: partial.url || "",
    pageTitle: partial.pageTitle || "",
    image: shot.image,
    shotError: shot.error || "",
    xPct: partial.xPct == null ? null : partial.xPct,
    yPct: partial.yPct == null ? null : partial.yPct,
    sensitive: Boolean(partial.sensitive),
  };
  guide.steps.push(step);
  await persist();
}

function enqueueCapture(partial, tabId) {
  captureChain = captureChain
    .then(function () {
      return addStep(partial, tabId);
    })
    .catch(function () {});
  return captureChain;
}

async function setRecording(on, tab) {
  await init();
  guide.recording = on;
  if (on && !guide.startedAt) guide.startedAt = Date.now();
  await persist();
  if (on) await injectAll();
  const tabs = await chrome.tabs.query({});
  for (const item of tabs) {
    if (!item.id) continue;
    chrome.tabs.sendMessage(item.id, { type: "RECORDING", on: on }).catch(function () {});
  }
  if (on && tab && isWebUrl(tab.url)) {
    await enqueueCapture(
      {
        kind: "navigate",
        pageTitle: tab.title,
        url: tab.url,
        text: describeStep({ kind: "navigate", pageTitle: tab.title }),
      },
      tab.id
    );
  }
}

async function injectAll() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !isWebUrl(tab.url)) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["describe.js", "content.js"],
      });
    } catch (error) {}
  }
}

chrome.runtime.onInstalled.addListener(function () {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});
  init();
});

chrome.commands.onCommand.addListener(async function (command) {
  if (command !== "toggle-recording") return;
  await init();
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await setRecording(!guide.recording, tab);
});

chrome.webNavigation.onCompleted.addListener(async function (details) {
  if (details.frameId !== 0 || !isWebUrl(details.url)) return;
  await init();
  if (!guide.recording) return;
  const now = Date.now();
  if (lastNav.url === details.url && now - lastNav.at < 1200) return;
  lastNav = { url: details.url, at: now };
  let title = "";
  try {
    const tab = await chrome.tabs.get(details.tabId);
    title = tab.title || "";
    if (guide.steps.length) {
      const last = guide.steps[guide.steps.length - 1];
      if (last.kind === "navigate" && last.url === details.url) return;
    }
  } catch (error) {}
  await enqueueCapture(
    {
      kind: "navigate",
      pageTitle: title,
      url: details.url,
      text: describeStep({ kind: "navigate", pageTitle: title }),
    },
    details.tabId
  );
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  handle(message, sender).then(sendResponse).catch(function (error) {
    sendResponse({ ok: false, error: String(error) });
  });
  return true;
});

async function handle(message, sender) {
  await init();
  if (message.type === "GET_STATE") return { ok: true, guide: guide };
  if (message.type === "SET_RECORDING") {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await setRecording(Boolean(message.on), tab);
    return { ok: true, guide: guide };
  }
  if (message.type === "EVENT") {
    if (!guide.recording) return { ok: true, guide: guide };
    const tabId = sender.tab && sender.tab.id;
    await enqueueCapture(message.event, tabId);
    return { ok: true };
  }
  if (message.type === "UPDATE_TITLE") {
    guide.title = String(message.title || "").slice(0, 80) || "未命名流程";
    await persist();
    return { ok: true, guide: guide };
  }
  if (message.type === "UPDATE_DESCRIPTION") {
    guide.description = String(message.description || "").slice(0, 1000);
    await persist();
    return { ok: true, guide: guide };
  }
  if (message.type === "UPDATE_STEP") {
    const step = guide.steps.find(function (item) {
      return item.id === message.id;
    });
    if (step && typeof message.text === "string") step.text = message.text.slice(0, 200);
    if (step && typeof message.note === "string") step.note = message.note.slice(0, 1000);
    await persist();
    return { ok: true, guide: guide };
  }
  if (message.type === "DELETE_STEP") {
    guide.steps = guide.steps.filter(function (item) {
      return item.id !== message.id;
    });
    await persist();
    return { ok: true, guide: guide };
  }
  if (message.type === "MOVE_STEP") {
    const index = guide.steps.findIndex(function (item) {
      return item.id === message.id;
    });
    const next = index + message.delta;
    if (index >= 0 && next >= 0 && next < guide.steps.length) {
      const moved = guide.steps.splice(index, 1)[0];
      guide.steps.splice(next, 0, moved);
      await persist();
    }
    return { ok: true, guide: guide };
  }
  if (message.type === "ADD_NOTE") {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const shot = tab && tab.id && isWebUrl(tab.url) ? await shotOf(tab.id, null, null) : { image: null, error: "" };
    const image = shot.image;
    guide.steps.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: Date.now(),
      kind: "note",
      text: "补充说明",
      note: message.text || "",
      url: tab && tab.url ? tab.url : "",
      pageTitle: tab && tab.title ? tab.title : "",
      image: image,
      xPct: null,
      yPct: null,
      sensitive: false,
    });
    await persist();
    return { ok: true, guide: guide };
  }
  if (message.type === "REDACT_STEP") {
    const step = guide.steps.find(function (item) {
      return item.id === message.id;
    });
    if (step) {
      step.sensitive = true;
      step.text = step.text.replace(/输入「[^」]*」/, "输入密码");
      await persist();
    }
    return { ok: true, guide: guide };
  }
  if (message.type === "CLEAR") {
    const recording = guide.recording;
    guide = emptyGuide();
    guide.recording = recording;
    if (recording) guide.startedAt = Date.now();
    await persist();
    return { ok: true, guide: guide };
  }
  return { ok: false };
}

init();
