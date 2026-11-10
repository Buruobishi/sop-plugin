importScripts('db.js', 'describe.js');

const MAX_STEPS = 100;
let guide = emptyGuide();
let ready = null;
let lastNav = { url: '', at: 0 };
let captureChain = Promise.resolve();

function isWebUrl(url) {
  return Boolean(url && (url.startsWith('http://') || url.startsWith('https://')));
}

function uniqueStepUrls() {
  const urls = [];
  (guide.steps || []).forEach((step) => {
    if (isWebUrl(step.url) && urls.indexOf(step.url) < 0) urls.push(step.url);
  },);
  return urls;
}

function descriptionWithPageUrls(text, urls) {
  const intro = String(text || '')
    .split('\n')
    .filter((line) => !isWebUrl(line.trim()))
    .join('\n')
    .trim();
  const lines = [];
  if (intro) lines.push(intro);
  urls.forEach((url) => {
    const next = lines.concat([url]).join('\n');
    if (next.length <= 1000) lines.push(url);
  },);
  return lines.join('\n');
}

function effectiveTitle() {
  const custom = String(guide.customTitle || '').trim();
  if (custom) return custom.slice(0, 80);
  const page = String(guide.pageTitle || '').trim();
  if (page) return page.slice(0, 80);
  return '未命名流程';
}

function normalizeTitle() {
  if (guide.customTitle == null) {
    if (guide.titleAuto === false && guide.title && guide.title !== '未命名流程') {
      guide.customTitle = guide.title;
    } else {
      guide.customTitle = '';
      if (!guide.pageTitle && guide.title && guide.title !== '未命名流程') guide.pageTitle = guide.title;
    }
  }
  guide.customTitle = String(guide.customTitle || '');
  guide.pageTitle = String(guide.pageTitle || '');
  guide.title = effectiveTitle();
}

function refreshPageTitle(tab, pageTitle) {
  const fromPage = String(pageTitle || '').replace(/\s+/g, ' ').trim();
  const fromTab = tab && isWebUrl(tab.url) ? String(tab.title || '') : '';
  const incoming = (fromPage || fromTab).replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!incoming) return false;
  const hasCustom = Boolean(String(guide.customTitle || '').trim());
  const hasSteps = Boolean(guide.steps && guide.steps.length);
  const follow = !hasCustom && !hasSteps;
  let changed = false;
  if (incoming && (follow || !guide.pageTitle) && guide.pageTitle !== incoming) {
    guide.pageTitle = incoming;
    changed = true;
  }
  const next = effectiveTitle();
  if (guide.title !== next) {
    guide.title = next;
    changed = true;
  }
  return changed;
}

function syncDescriptionUrls() {
  if (guide.descriptionAuto === false) return false;
  const next = descriptionWithPageUrls(guide.description, uniqueStepUrls());
  if (next === (guide.description || '')) return false;
  guide.description = next;
  return true;
}

async function init() {
  if (!ready) {
    ready = loadGuide()
      .then(async (saved) => {
        guide = saved;
        normalizeTitle();
        if (guide.recording) await injectAll();
        syncBadge();
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
          /* 忽略失败 */
        });
      },);
  }
  return ready;
}

function syncBadge() {
  if (guide.recording) {
    chrome.action.setBadgeBackgroundColor({ color: '#c2410c' });
    chrome.action.setBadgeText({ text: String(guide.steps.length || '●') });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

function broadcast(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    /* 忽略失败 */
  });
}

async function persist() {
  await saveGuide(guide);
  syncBadge();
  broadcast({ type: 'GUIDE', guide });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.onerror = () => {
      reject(reader.error);
    };
    reader.readAsDataURL(blob);
  },);
}

function drawClick(ctx, width, height, xPct, yPct) {
  if (xPct == null || yPct == null) return;
  const x = (xPct / 100) * width;
  const y = (yPct / 100) * height;
  const radius = Math.max(16, Math.round(Math.min(width, height) * 0.028));
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius + 10, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(234, 88, 12, 0.28)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#ea580c';
  ctx.lineWidth = Math.max(4, Math.round(radius * 0.24));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, Math.max(4, radius * 0.2), 0, Math.PI * 2);
  ctx.fillStyle = '#ea580c';
  ctx.fill();
  ctx.restore();
}

function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const mime = (header.match(/^data:([^;,]+)/) || [])[1] || 'image/png';
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function shrink(dataUrl, xPct, yPct) {
  const blob = dataUrlToBlob(dataUrl);
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 2560 / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  drawClick(ctx, width, height, xPct, yPct);
  const png = await canvas.convertToBlob({ type: 'image/png' });
  bitmap.close();
  return blobToDataUrl(png);
}

function mosaicRegion(width, height, box, xPct, yPct) {
  if (box && box.w > 0 && box.h > 0) {
    const padX = Math.max(8, width * 0.012);
    const padY = Math.max(6, height * 0.012);
    return {
      x: (box.x / 100) * width - padX,
      y: (box.y / 100) * height - padY,
      w: (box.w / 100) * width + padX * 2,
      h: (box.h / 100) * height + padY * 2,
    };
  }
  if (xPct == null || yPct == null) return null;
  const w = Math.max(120, width * 0.38);
  const h = Math.max(48, height * 0.1);
  return {
    x: (xPct / 100) * width - w / 2,
    y: (yPct / 100) * height - h / 2,
    w,
    h,
  };
}

function drawMosaic(ctx, region) {
  if (!region) return;
  const canvas = ctx.canvas;
  const x = Math.max(0, Math.floor(region.x));
  const y = Math.max(0, Math.floor(region.y));
  const w = Math.min(canvas.width - x, Math.ceil(region.w));
  const h = Math.min(canvas.height - y, Math.ceil(region.h));
  if (w < 2 || h < 2) return;
  const block = Math.max(18, Math.round(Math.min(w, h) / 3));
  const image = ctx.getImageData(x, y, w, h);
  const data = image.data;
  for (let by = 0; by < h; by += block) {
    for (let bx = 0; bx < w; bx += block) {
      const sx = Math.min(bx + Math.floor(block / 2), w - 1);
      const sy = Math.min(by + Math.floor(block / 2), h - 1);
      const index = (sy * w + sx) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      const blockWidth = Math.min(block, w - bx);
      const blockHeight = Math.min(block, h - by);
      for (let py = 0; py < blockHeight; py += 1) {
        let cursor = ((by + py) * w + bx) * 4;
        for (let px = 0; px < blockWidth; px += 1) {
          data[cursor] = red;
          data[cursor + 1] = green;
          data[cursor + 2] = blue;
          data[cursor + 3] = alpha;
          cursor += 4;
        }
      }
    }
  }
  ctx.putImageData(image, x, y);
}

async function mosaicImage(dataUrl, box, xPct, yPct) {
  const blob = dataUrlToBlob(dataUrl);
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  drawMosaic(ctx, mosaicRegion(canvas.width, canvas.height, box, xPct, yPct));
  const png = await canvas.convertToBlob({ type: 'image/png' });
  return blobToDataUrl(png);
}

async function captureTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  if (chrome.tabs.captureTab) {
    try {
      return await chrome.tabs.captureTab(tab.id, { format: 'png' });
    } catch {
      /* 忽略失败 */
    }
  }
  return chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
}

async function shotOf(tabId, xPct, yPct) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab || tab.windowId == null || !isWebUrl(tab.url)) {
        return { image: null, error: '当前标签不是普通网页，无法截图' };
      }
      const png = await captureTab(tab);
      if (!png) throw new Error('浏览器没有返回截图');
      try {
        return { image: await shrink(png, xPct, yPct), error: '' };
      } catch (drawError) {
        return { image: png, error: '' };
      }
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      },);
    }
  }
  const message = String(lastError && lastError.message ? lastError.message : lastError);
  return {
    image: null,
    error: /all_urls|activeTab|permission|access/i.test(message)
      ? '没有截图权限。打开 chrome://extensions，进入本插件详情，把网站访问权限改成「在所有网站上」，然后重新加载插件。'
      : message,
  };
}

async function addStep(partial, tabId) {
  if (!guide.recording) return;
  if (guide.steps.length >= MAX_STEPS) {
    broadcast({ type: 'LIMIT', max: MAX_STEPS });
    return;
  }
  const shot = tabId
    ? await shotOf(tabId, partial.xPct, partial.yPct)
    : { image: null, error: '没有对应的网页标签' };
  const step = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts: Date.now(),
    kind: partial.kind,
    text: partial.text || describeStep(partial),
    note: partial.note || '',
    url: partial.url || '',
    pageTitle: partial.pageTitle || '',
    image: shot.image,
    shotError: shot.error || '',
    xPct: partial.xPct == null ? null : partial.xPct,
    yPct: partial.yPct == null ? null : partial.yPct,
    box: partial.box || null,
    sensitive: Boolean(partial.sensitive),
  };
  placeStep(step);
  syncDescriptionUrls();
  await persist();
}

function placeStep(step) {
  const afterIndex = guide.steps.findIndex((item) => {
    return item.id === guide.insertAfterId;
  },);
  if (afterIndex >= 0) {
    guide.steps.splice(afterIndex + 1, 0, step);
    guide.insertAfterId = step.id;
    return;
  }
  guide.steps.push(step);
}

function enqueueCapture(partial, tabId) {
  captureChain = captureChain
    .then(() => {
      return addStep(partial, tabId);
    },)
    .catch(() => {
      /* 忽略失败 */
    });
  return captureChain;
}

function collectPageProfile() {
  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }
  const title = clean(document.title).slice(0, 80);
  const meta = document.querySelector('meta[name="description"]');
  const og = document.querySelector('meta[property="og:description"]');
  let intro = clean(meta && meta.getAttribute('content')) || clean(og && og.getAttribute('content'));
  if (!intro || intro === title) {
    const root = document.querySelector("main, [role='main'], article") || document.body;
    const paragraphs = root.querySelectorAll('p');
    for (let index = 0; index < paragraphs.length && index < 12; index += 1) {
      const paragraph = paragraphs[index];
      if (paragraph.closest('nav, footer, aside, header, form')) continue;
      const text = clean(paragraph.innerText);
      if (text.length < 12 || text === title) continue;
      intro = text.slice(0, 500);
      break;
    }
  }
  if (!intro || intro === title) {
    const heading = document.querySelector('h1');
    const next = heading && heading.nextElementSibling;
    const text = clean(next && next.innerText);
    if (text && text !== title && text.length >= 12) intro = text.slice(0, 500);
  }
  if (intro === title) intro = '';
  return { title, intro: clean(intro).slice(0, 1000) };
}

async function readPageProfile(tab) {
  if (!tab || !tab.id || !isWebUrl(tab.url)) return null;
  try {
    const injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectPageProfile,
    },);
    return injected && injected[0] ? injected[0].result : null;
  } catch (error) {
    return null;
  }
}

async function applyPageDefaults(tab) {
  if (!tab || !tab.id || !isWebUrl(tab.url)) return false;
  const hasCustom = Boolean(String(guide.customTitle || '').trim());
  const hasSteps = Boolean(guide.steps && guide.steps.length);
  const fillDescription = guide.descriptionAuto === true
    || (guide.descriptionAuto !== false && !guide.description);
  const profile = !hasCustom && (!hasSteps || fillDescription || !guide.pageTitle)
    ? await readPageProfile(tab)
    : null;
  const titleChanged = refreshPageTitle(tab, profile && profile.title);
  if (!fillDescription) return titleChanged;
  const intro = String((profile && profile.intro) || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
  let changed = titleChanged;
  if (fillDescription && intro && intro !== guide.description) {
    guide.description = intro;
    guide.descriptionAuto = true;
    changed = true;
  }
  return changed;
}

async function setRecording(on, tab, insertAfterId, titleText) {
  await init();
  guide.recording = on;
  guide.insertAfterId = on ? (insertAfterId || null) : null;
  if (on && !guide.startedAt) guide.startedAt = Date.now();
  if (on) {
    const typed = String(titleText || '').trim().slice(0, 80);
    const hasCustom = Boolean(String(guide.customTitle || '').trim());
    if (typed && typed !== '未命名流程' && !hasCustom) {
      guide.pageTitle = typed;
      guide.title = effectiveTitle();
    }
  }
  if (on) await applyPageDefaults(tab);
  syncDescriptionUrls();
  await persist();
  if (on) await injectAll();
  const tabs = await chrome.tabs.query({});
  for (const item of tabs) {
    if (!item.id) continue;
    chrome.tabs.sendMessage(item.id, { type: 'RECORDING', on }).catch(() => {
      /* 忽略失败 */
    });
  }
  if (on && tab && isWebUrl(tab.url)) {
    await enqueueCapture(
      {
        kind: 'navigate',
        pageTitle: tab.title,
        url: tab.url,
        text: describeStep({ kind: 'navigate', pageTitle: tab.title }),
      },
      tab.id,
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
        files: ['describe.js', 'content.js'],
      },);
    } catch {
      /* 忽略失败 */
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    /* 忽略失败 */
  });
  init();
},);

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-recording') return;
  await init();
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await setRecording(!guide.recording, tab);
},);

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0 || !isWebUrl(details.url)) return;
  await init();
  if (!guide.recording) return;
  const now = Date.now();
  if (lastNav.url === details.url && now - lastNav.at < 1200) return;
  lastNav = { url: details.url, at: now };
  let title = '';
  try {
    const tab = await chrome.tabs.get(details.tabId);
    title = tab.title || '';
    if (guide.steps.length) {
      const last = guide.steps[guide.steps.length - 1];
      if (last.kind === 'navigate' && last.url === details.url) return;
    }
  } catch {
    /* 忽略失败 */
  }
  await enqueueCapture(
    {
      kind: 'navigate',
      pageTitle: title,
      url: details.url,
      text: describeStep({ kind: 'navigate', pageTitle: title }),
    },
    details.tabId,
  );
},);

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!info.title || !isWebUrl(tab && tab.url)) return;
  await init();
  const hasCustom = Boolean(String(guide.customTitle || '').trim());
  const hasSteps = Boolean(guide.steps && guide.steps.length);
  if (hasCustom || hasSteps) return;
  const tabs = await chrome.tabs.query({ active: true });
  const visible = tabs.some((item) => item.id === tabId);
  if (!visible) return;
  if (refreshPageTitle(tab, info.title)) await persist();
},);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message, sender).then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: String(error) });
  });
  return true;
},);

async function activeWebTab() {
  const queries = [
    { active: true, lastFocusedWindow: true },
    { active: true },
  ];
  for (let index = 0; index < queries.length; index += 1) {
    try {
      const tabs = await chrome.tabs.query(queries[index]);
      for (let tabIndex = 0; tabIndex < tabs.length; tabIndex += 1) {
        if (isWebUrl(tabs[tabIndex].url)) return tabs[tabIndex];
      }
    } catch (error) {
      /* 忽略失败 */
    }
  }
  return null;
}

async function handle(message, sender) {
  await init();
  if (message.type === 'GET_STATE') {
    const tab = await activeWebTab();
    const pageChanged = await applyPageDefaults(tab);
    const urlsChanged = syncDescriptionUrls();
    if (pageChanged || urlsChanged) await persist();
    return { ok: true, guide };
  }
  if (message.type === 'SET_RECORDING') {
    const tab = await activeWebTab();
    await setRecording(Boolean(message.on), tab, message.insertAfterId || null, message.title || '');
    return { ok: true, guide };
  }
  if (message.type === 'CONTINUE_AFTER') {
    const id = guide.steps.some((item) => {
      return item.id === message.id;
    },) ? message.id : null;
    if (guide.recording) {
      guide.insertAfterId = id;
      await persist();
    } else {
      const tab = await activeWebTab();
      await setRecording(true, tab, id);
    }
    return { ok: true, guide };
  }
  if (message.type === 'EVENT') {
    if (!guide.recording) return { ok: true, guide };
    const tabId = sender.tab && sender.tab.id;
    await enqueueCapture(message.event, tabId);
    return { ok: true };
  }
  if (message.type === 'SET_PAGE_TITLE') {
    const incoming = String(message.title || '').trim().slice(0, 80);
    const hasCustom = Boolean(String(guide.customTitle || '').trim());
    const hasSteps = Boolean(guide.steps && guide.steps.length);
    if (incoming && !hasCustom && (!hasSteps || !guide.pageTitle) && guide.pageTitle !== incoming) {
      guide.pageTitle = incoming;
      guide.title = effectiveTitle();
      await persist();
    }
    return { ok: true, guide };
  }
  if (message.type === 'UPDATE_TITLE') {
    const typed = String(message.title || '').trim().slice(0, 80);
    const page = String(guide.pageTitle || '').trim();
    if (!typed || typed === page || typed === '未命名流程') {
      guide.customTitle = '';
      guide.titleAuto = true;
    } else {
      guide.customTitle = typed;
      guide.titleAuto = false;
    }
    guide.title = effectiveTitle();
    await persist();
    return { ok: true, guide };
  }
  if (message.type === 'UPDATE_DESCRIPTION') {
    guide.description = String(message.description || '').slice(0, 1000);
    guide.descriptionAuto = false;
    await persist();
    return { ok: true, guide };
  }
  if (message.type === 'UPDATE_STEP') {
    const step = guide.steps.find((item) => {
      return item.id === message.id;
    },);
    if (step && typeof message.text === 'string') step.text = message.text.slice(0, 200);
    if (step && typeof message.note === 'string') step.note = message.note.slice(0, 1000);
    await persist();
    return { ok: true, guide };
  }
  if (message.type === 'DELETE_STEP') {
    guide.steps = guide.steps.filter((item) => {
      return item.id !== message.id;
    },);
    if (guide.insertAfterId === message.id) guide.insertAfterId = null;
    await persist();
    return { ok: true, guide };
  }
  if (message.type === 'MOVE_STEP') {
    const index = guide.steps.findIndex((item) => {
      return item.id === message.id;
    },);
    const next = index + message.delta;
    if (index >= 0 && next >= 0 && next < guide.steps.length) {
      const moved = guide.steps.splice(index, 1)[0];
      guide.steps.splice(next, 0, moved);
      await persist();
    }
    return { ok: true, guide };
  }
  if (message.type === 'ADD_NOTE') {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const shot = tab && tab.id && isWebUrl(tab.url) ? await shotOf(tab.id, null, null) : { image: null, error: '' };
    placeStep({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: Date.now(),
      kind: 'note',
      text: '补充说明',
      note: message.text || '',
      url: tab && tab.url ? tab.url : '',
      pageTitle: tab && tab.title ? tab.title : '',
      image: shot.image,
      xPct: null,
      yPct: null,
      sensitive: false,
    },);
    await persist();
    return { ok: true, guide };
  }
  if (message.type === 'REDACT_STEP') {
    const step = guide.steps.find((item) => {
      return item.id === message.id;
    },);
    if (step) {
      step.sensitive = true;
      step.text = step.text.replace(/输入「[^」]*」/, '输入密码');
      if (step.image) {
        try {
          step.image = await mosaicImage(step.image, step.box, step.xPct, step.yPct);
        } catch {
          /* 忽略失败 */
        }
      }
      await persist();
    }
    return { ok: true, guide };
  }
  if (message.type === 'CLEAR') {
    const recording = guide.recording;
    guide = emptyGuide();
    guide.recording = recording;
    if (recording) guide.startedAt = Date.now();
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await applyPageDefaults(tab);
    await persist();
    return { ok: true, guide };
  }
  return { ok: false };
}

init();
