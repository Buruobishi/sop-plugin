const stepId = new URLSearchParams(location.search).get('id') || '';
const canvas = document.getElementById('canvas');
const stage = document.getElementById('stage');
const hint = document.getElementById('hint');
let ctx = null;
let painting = false;
let last = null;
let zoom = 1;

function mixPaint(value, target, amount) {
  return Math.max(0, Math.min(255, Math.round(value * (1 - amount) + target * amount)));
}

function paintMosaic(x, y) {
  const block = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) / 110));
  const radius = block * 2.6;
  const x0 = Math.max(0, Math.floor((x - radius) / block) * block);
  const y0 = Math.max(0, Math.floor((y - radius) / block) * block);
  const x1 = Math.min(canvas.width, Math.ceil((x + radius) / block) * block);
  const y1 = Math.min(canvas.height, Math.ceil((y + radius) / block) * block);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 2 || h < 2) return;
  const image = ctx.getImageData(x0, y0, w, h);
  const data = image.data;
  const reach = radius * radius;
  for (let by = 0; by < h; by += block) {
    for (let bx = 0; bx < w; bx += block) {
      const cx = x0 + bx + block / 2;
      const cy = y0 + by + block / 2;
      if ((cx - x) * (cx - x) + (cy - y) * (cy - y) > reach) continue;
      const sx = Math.min(bx + Math.floor(block / 2), w - 1);
      const sy = Math.min(by + Math.floor(block / 2), h - 1);
      const index = (sy * w + sx) * 4;
      const lighten = ((Math.floor(cx / block) + Math.floor(cy / block)) % 2) === 0;
      const amount = lighten ? 0.62 : 0.45;
      const red = mixPaint(data[index], lighten ? 167 : 61, amount);
      const green = mixPaint(data[index + 1], lighten ? 156 : 52, amount);
      const blue = mixPaint(data[index + 2], lighten ? 245 : 120, amount);
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
  ctx.putImageData(image, x0, y0);
}

function strokeMosaic(from, to) {
  const block = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) / 110));
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const count = Math.max(1, Math.ceil(dist / block));
  for (let index = 0; index <= count; index += 1) {
    const t = index / count;
    paintMosaic(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
  }
}

function pointOf(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function applyZoom() {
  const fit = Math.max(1, (stage.clientWidth - 4) / canvas.width);
  canvas.style.width = Math.round(canvas.width * fit * zoom) + 'px';
  canvas.style.height = 'auto';
}

function canvasToDataUrl() {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      }
    }, 30,);
  },);
}

canvas.addEventListener('pointerdown', (event) => {
  if (!ctx) return;
  const point = pointOf(event);
  painting = true;
  last = point;
  paintMosaic(point.x, point.y);
  canvas.setPointerCapture(event.pointerId);
},);

canvas.addEventListener('pointermove', (event) => {
  if (!painting) return;
  const point = pointOf(event);
  strokeMosaic(last, point);
  last = point;
},);

canvas.addEventListener('pointerup', () => {
  painting = false;
},);

canvas.addEventListener('pointercancel', () => {
  painting = false;
},);

document.getElementById('zoom-in').addEventListener('click', () => {
  zoom = Math.min(3, Math.round((zoom + 0.35) * 100) / 100);
  applyZoom();
},);

document.getElementById('zoom-out').addEventListener('click', () => {
  zoom = Math.max(1, Math.round((zoom - 0.35) * 100) / 100);
  applyZoom();
},);

document.getElementById('cancel').addEventListener('click', () => {
  window.close();
},);

document.getElementById('done').addEventListener('click', async () => {
  if (!ctx) return;
  hint.textContent = '正在保存…';
  try {
    const fresh = await loadGuide();
    const step = (fresh.steps || []).find((item) => item.id === stepId);
    if (!step) {
      hint.textContent = '这一步已经不在了。';
      return;
    }
    const image = await canvasToDataUrl();
    fresh.steps = (fresh.steps || []).map((item) => {
      if (item.id !== stepId) return item;
      return Object.assign({}, item, { image });
    },);
    fresh.shotRev = Date.now();
    await saveGuide(fresh);
    const channel = new BroadcastChannel('sop-guide');
    const applied = new Promise((resolve) => {
      const timer = setTimeout(resolve, 1200);
      channel.onmessage = (event) => {
        if (!event.data || event.data.type !== 'shot-applied') return;
        clearTimeout(timer);
        resolve();
      };
    },);
    channel.postMessage({ type: 'shot-saved', id: stepId });
    chrome.storage.local.set({ shotEditSaved: fresh.shotRev });
    chrome.runtime.sendMessage({ type: 'RELOAD_GUIDE' }).catch(() => {
      /* 忽略失败 */
    });
    await applied;
    channel.close();
    window.close();
  } catch (error) {
    hint.textContent = '没有保存成功，请再点一次完成。';
  }
},);

loadGuide().then((guide) => {
  const step = (guide.steps || []).find((item) => item.id === stepId);
  if (!step || !step.image) {
    hint.textContent = '没有找到这张截图。';
    return;
  }
  const image = new Image();
  image.onload = () => {
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0);
    applyZoom();
  };
  image.onerror = () => {
    hint.textContent = '这张截图没有打开。';
  };
  image.src = step.image;
},);
