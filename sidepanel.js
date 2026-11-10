let guide = null;

function ask(message) {
  return chrome.runtime.sendMessage(message);
}

function render() {
  const title = document.getElementById('title');
  const description = document.getElementById('description');
  const toggle = document.getElementById('toggle');
  const status = document.getElementById('status');
  const list = document.getElementById('steps');
  if (!guide) return;
  if (document.activeElement !== title) {
    const custom = String(guide.customTitle || '').trim();
    const pageTitle = String(guide.pageTitle || '').trim();
    const stored = String(guide.title || '').trim();
    const shown = custom || pageTitle || (stored === '未命名流程' ? '' : stored);
    if (shown) title.value = shown;
  }
  if (document.activeElement !== description) description.value = guide.description || '';
  const resumeIndex = guide.insertAfterId
    ? guide.steps.findIndex((step) => step.id === guide.insertAfterId)
    : -1;
  toggle.textContent = guide.recording ? '完成录制' : (guide.steps.length ? '继续录制' : '开始录制');
  toggle.classList.toggle('live', Boolean(guide.recording));
  if (guide.recording && resumeIndex >= 0) {
    status.textContent = '正在续录，新步骤接在第 ' + (resumeIndex + 1) + ' 步后面。已记 ' + guide.steps.length + ' 步。';
  } else if (guide.recording) {
    status.textContent = '正在录制，已记 ' + guide.steps.length + ' 步。快捷键 Command+Shift+Y 可结束。密码框只记「输入密码」。';
  } else if (guide.steps.length) {
    status.textContent = '已记 ' + guide.steps.length + ' 步。继续录制会接到最后，也可以从某一步后面接着录。';
  } else {
    status.textContent = '点开始后，去网页上把流程走一遍。录下来的步骤可以改、排序，再导出文档和视频。';
  }
  if (!guide.steps.length) {
    list.innerHTML = "<p class='empty'>还没有步骤。</p>";
    return;
  }
  list.innerHTML = '';
  guide.steps.forEach((step, index) => {
    const item = document.createElement('li');
    item.className = 'step';
    if (guide.recording && guide.insertAfterId === step.id) item.classList.add('resume-here');
    const num = document.createElement('div');
    num.className = 'num';
    num.textContent = String(index + 1);
    const body = document.createElement('div');
    const titleField = document.createElement('label');
    titleField.className = 'field';
    titleField.textContent = '标题';
    const text = document.createElement('textarea');
    text.className = 'step-title';
    text.rows = 1;
    text.value = step.text || '';
    text.addEventListener('change', () => {
      ask({ type: 'UPDATE_STEP', id: step.id, text: text.value });
    },);
    const noteField = document.createElement('label');
    noteField.className = 'field note-label';
    noteField.textContent = '说明';
    const note = document.createElement('textarea');
    note.className = 'step-note';
    note.rows = 2;
    note.placeholder = '这一步要确认什么、做错了会怎样';
    note.value = step.note || '';
    note.addEventListener('change', () => {
      ask({ type: 'UPDATE_STEP', id: step.id, note: note.value });
    },);
    body.appendChild(titleField);
    body.appendChild(text);
    body.appendChild(noteField);
    body.appendChild(note);
    const shot = document.createElement('div');
    shot.className = 'shot';
    if (step.image) {
      const img = document.createElement('img');
      img.src = step.image;
      img.alt = '步骤截图，橙色圆点是点击位置';
      img.title = '点击涂抹马赛克';
      img.addEventListener('click', () => {
        openShotEditor(step.id);
      },);
      shot.appendChild(img);
    } else {
      const missing = document.createElement('p');
      missing.className = 'missing';
      missing.textContent = step.shotError || '这一步没有截到画面。';
      shot.appendChild(missing);
    }
    body.appendChild(shot);
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.appendChild(action('上移', () => {
      ask({ type: 'MOVE_STEP', id: step.id, delta: -1 });
    },),);
    actions.appendChild(action('下移', () => {
      ask({ type: 'MOVE_STEP', id: step.id, delta: 1 });
    },),);
    actions.appendChild(action('删除', () => {
      ask({ type: 'DELETE_STEP', id: step.id });
    },),);
    actions.appendChild(action('在此后续录', () => {
      ask({ type: 'CONTINUE_AFTER', id: step.id }).then((response) => {
        if (response && response.guide) {
          guide = response.guide;
          render();
        }
      },);
    },),);
    if (step.kind === 'type') {
      actions.appendChild(action('涂掉输入', () => {
        ask({ type: 'REDACT_STEP', id: step.id }).then((response) => {
          if (response && response.guide) {
            guide = response.guide;
            render();
          }
        },);
      },),);
    }
    body.appendChild(actions);
    item.appendChild(num);
    item.appendChild(body);
    list.appendChild(item);
  },);
}

function action(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

document.getElementById('toggle').addEventListener('click', async () => {
  const starting = !(guide && guide.recording);
  const typed = document.getElementById('title').value.trim();
  const response = await ask({
    type: 'SET_RECORDING',
    on: starting,
    title: typed,
  });
  if (response && response.guide) {
    guide = response.guide;
    if (starting && typed && !String(guide.pageTitle || '').trim() && !String(guide.customTitle || '').trim()) {
      guide.pageTitle = typed;
      guide.title = typed;
    }
    render();
  }
},);

document.getElementById('title').addEventListener('change', (event) => {
  ask({ type: 'UPDATE_TITLE', title: event.target.value });
},);

async function rememberVisibleTitle() {
  if (!guide) return;
  const input = document.getElementById('title');
  const typed = input ? input.value.trim().slice(0, 80) : '';
  if (typed && typed !== '未命名流程') {
    const response = await ask({ type: 'UPDATE_TITLE', title: typed });
    if (response && response.guide) guide = response.guide;
  }
  const visible = displayTitle(guide);
  if (visible !== '未命名流程') guide.title = visible;
  else if (typed && typed !== '未命名流程') guide.title = typed;
}

document.getElementById('description').addEventListener('change', (event) => {
  ask({ type: 'UPDATE_DESCRIPTION', description: event.target.value });
},);

document.getElementById('note').addEventListener('click', () => {
  const text = window.prompt('补充说明', '注意：');
  if (text) ask({ type: 'ADD_NOTE', text });
},);

document.getElementById('privacy').addEventListener('click', async () => {
  const status = document.getElementById('status');
  status.textContent = '正在给截图打马赛克…';
  const response = await ask({ type: 'REDACT_ALL' });
  if (response && response.guide) {
    guide = response.guide;
    render();
    document.getElementById('status').textContent = '已把各步骤截图里的输入内容打上马赛克。';
    return;
  }
  status.textContent = '没有打上马赛克，请再试一次。';
},);

function openShotEditor(id) {
  const width = Math.max(960, Math.min(1600, Math.round(screen.availWidth * 0.86)));
  const height = Math.max(680, Math.min(1100, Math.round(screen.availHeight * 0.86)));
  chrome.windows.create({
    url: chrome.runtime.getURL('shot-editor.html?id=' + encodeURIComponent(id)),
    type: 'popup',
    width,
    height,
    left: Math.max(0, Math.round((screen.availWidth - width) / 2)),
    top: Math.max(0, Math.round((screen.availHeight - height) / 2)),
    focused: true,
  },);
}

document.getElementById('clear').addEventListener('click', async () => {
  if (!window.confirm('清空当前全部步骤？')) return;
  const response = await ask({ type: 'CLEAR' });
  if (response && response.guide) {
    guide = response.guide;
    render();
  }
},);

document.getElementById('copy').addEventListener('click', async () => {
  if (!guide) return;
  await rememberVisibleTitle();
  await navigator.clipboard.writeText(toPlainText(guide));
  const button = document.getElementById('copy');
  button.textContent = '已复制';
  setTimeout(() => {
    button.textContent = '复制文字';
  }, 1200,);
},);

document.getElementById('markdown').addEventListener('click', async () => {
  if (!guide) return;
  await rememberVisibleTitle();
  downloadMarkdown(guide);
},);

function wrapPdfText(ctx, text, maxWidth) {
  const lines = [];
  String(text || '').split('\n').forEach((part) => {
    const chars = Array.from(part);
    let line = '';
    chars.forEach((ch) => {
      const next = line + ch;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = ch;
      } else {
        line = next;
      }
    },);
    if (line) lines.push(line);
  },);
  return lines.length ? lines : [''];
}

function loadPdfImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = src;
  },);
}

const PDF_PAPER = {
  a3: [841.89, 1190.55],
  a4: [595.28, 841.89],
  a5: [419.53, 595.28],
  b5: [498.9, 708.66],
  letter: [612, 792],
  legal: [612, 1008],
};

const PDF_DEFAULT = {
  paper: '#f3f1fb',
  ink: '#241b4a',
  muted: '#6d678c',
  accent: '#5b46f5',
  page: 'a4',
  orientation: 'portrait',
  size: 'm',
  margin: 'm',
  image: 100,
  titleColor: '#241b4a',
  titleSize: 28,
  titleBold: true,
  titleAlign: 'left',
  stepColor: '#241b4a',
  stepSize: 20,
  stepBold: true,
  stepAlign: 'left',
  noteColor: '#241b4a',
  noteSize: 13,
  noteBold: false,
  blockGap: 16,
  lineGap: 6,
  stepsPerPage: 1,
  showStepUrl: false,
  showRecordedAt: false,
  showTitleUrls: false,
  showLabels: true,
  signOff: '',
  logo: '',
  logoPosition: 'top-right',
  logoSize: 16,
  watermark: '',
  watermarkPosition: 'center',
  watermarkSize: 36,
  watermarkOpacity: 18,
};

const MARK_POSITIONS = {
  'top-left': [0, 0],
  'top-center': [0.5, 0],
  'top-right': [1, 0],
  'middle-left': [0, 0.5],
  center: [0.5, 0.5],
  'middle-right': [1, 0.5],
  'bottom-left': [0, 1],
  'bottom-center': [0.5, 1],
  'bottom-right': [1, 1],
};

const pdfMarkData = {
  logo: '',
  logoMode: 'default',
  watermark: '',
};

function hexColor(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : fallback;
}

function imagePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 100;
  return Math.min(100, Math.max(30, Math.round(number)));
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function setRange(id, labelId, value, min, max, fallback, suffix) {
  const next = clampInt(value, min, max, fallback);
  document.getElementById(id).value = String(next);
  document.getElementById(labelId).textContent = next + suffix;
  return next;
}

function setStepsPerPage(value) {
  const next = clampInt(value, 1, 20, PDF_DEFAULT.stepsPerPage);
  document.getElementById('pdf-steps').value = String(next);
  return next;
}

function setImagePercent(value) {
  const percent = imagePercent(value);
  document.getElementById('pdf-image').value = String(percent);
  document.getElementById('pdf-image-label').textContent = percent + '%';
}

function textAlign(value, fallback) {
  if (value === 'left' || value === 'center' || value === 'right') return value;
  return fallback;
}

function markPosition(value, fallback) {
  if (value === '') return '';
  return MARK_POSITIONS[value] ? value : fallback;
}

function imageDataUrl(value) {
  return typeof value === 'string' && value.indexOf('data:image/') === 0 ? value : '';
}

function paintMarkState() {
  let logoState = '未上传';
  if (pdfMarkData.logoMode === 'default' && pdfMarkData.logo) logoState = '默认商标';
  else if (pdfMarkData.logo) logoState = '已上传';
  document.getElementById('pdf-logo-state').textContent = logoState;
  const watermarkState = pdfMarkData.watermark ? '已上传' : '未上传';
  document.getElementById('pdf-watermark-state').textContent = watermarkState;
}

let defaultLogoUrl = '';

function loadDefaultLogo() {
  if (defaultLogoUrl) {
    if (pdfMarkData.logoMode === 'default') pdfMarkData.logo = defaultLogoUrl;
    paintMarkState();
    return Promise.resolve(defaultLogoUrl);
  }
  return fetch('logotext.svg')
    .then((response) => response.blob())
    .then((blob) => readMarkFile(new File([blob], 'logotext.svg', { type: 'image/svg+xml' })))
    .then((url) => plateWordmark(url))
    .then((url) => {
      defaultLogoUrl = url;
      if (pdfMarkData.logoMode === 'default') {
        pdfMarkData.logo = url;
        paintMarkState();
        savePdfStyle();
      }
      return url;
    })
    .catch(() => '');
}

function plateWordmark(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const padX = Math.round(img.width * 0.08);
      const padY = Math.round(img.height * 0.28);
      const canvas = document.createElement('canvas');
      canvas.width = img.width + padX * 2;
      canvas.height = img.height + padY * 2;
      const ctx = canvas.getContext('2d');
      const radius = Math.round(canvas.height * 0.18);
      ctx.fillStyle = '#241b4a';
      ctx.beginPath();
      ctx.roundRect(0, 0, canvas.width, canvas.height, radius);
      ctx.fill();
      ctx.drawImage(img, padX, padY);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      resolve(dataUrl);
    };
    img.src = dataUrl;
  },);
}

function isSvgFile(file) {
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  return type === 'image/svg+xml' || name.endsWith('.svg');
}

function svgPixelSize(text) {
  const viewBox = text.match(/viewBox=["']\s*[0-9.+-eE]+[\s,]+[0-9.+-eE]+[\s,]+([0-9.+-eE]+)[\s,]+([0-9.+-eE]+)/);
  if (viewBox) {
    const width = Math.abs(Number(viewBox[1]));
    const height = Math.abs(Number(viewBox[2]));
    if (width > 0 && height > 0) return { width, height };
  }
  const widthMatch = text.match(/<svg[^>]*\bwidth=["']([0-9.]+)/);
  const heightMatch = text.match(/<svg[^>]*\bheight=["']([0-9.]+)/);
  const width = widthMatch ? Number(widthMatch[1]) : 0;
  const height = heightMatch ? Number(heightMatch[1]) : 0;
  if (width > 0 && height > 0) return { width, height };
  return { width: 480, height: 480 };
}

function paintImageFile(file, maxEdge, allowUpscale) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const sourceWidth = img.naturalWidth || img.width || 1;
      const sourceHeight = img.naturalHeight || img.height || 1;
      const longest = Math.max(sourceWidth, sourceHeight);
      const scale = allowUpscale ? maxEdge / longest : Math.min(1, maxEdge / longest);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片没有读出来'));
    };
    img.src = url;
  });
}

function readMarkFile(file) {
  if (!file || file.size > 8 * 1024 * 1024) return Promise.reject(new Error('图片太大'));
  if (!isSvgFile(file)) return paintImageFile(file, 480, false);
  return file.text().then((text) => {
    const size = svgPixelSize(text);
    const longest = Math.max(size.width, size.height) || 1;
    const scale = 960 / longest;
    const width = Math.max(1, Math.round(size.width * scale));
    const height = Math.max(1, Math.round(size.height * scale));
    const sized = text.replace(/<svg\b([^>]*)>/, (match, attrs) => {
      const cleaned = attrs.replace(/\s(?:width|height)=["'][^"']*["']/g, '');
      return '<svg' + cleaned + ' width="' + width + '" height="' + height + '">';
    },);
    return paintImageFile(new Blob([sized], { type: 'image/svg+xml' }), 960, true);
  },);
}

function drawStoredMark(ctx, image, pageWidth, pageHeight, position, sizePercent, opacityPercent) {
  const anchor = MARK_POSITIONS[position];
  if (!image || !anchor) return;
  const margin = Math.round(pageWidth * 0.04);
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  let boxWidth = Math.max(24, Math.round(pageWidth * (clampInt(sizePercent, 8, 80, 16) / 100)));
  let boxHeight = Math.round(boxWidth * (image.height / image.width));
  if (boxWidth > maxWidth) {
    boxHeight = Math.round(boxHeight * (maxWidth / boxWidth));
    boxWidth = maxWidth;
  }
  if (boxHeight > maxHeight) {
    boxWidth = Math.max(1, Math.round(boxWidth * (maxHeight / boxHeight)));
    boxHeight = maxHeight;
  }
  const x = margin + anchor[0] * (maxWidth - boxWidth);
  const y = margin + anchor[1] * (maxHeight - boxHeight);
  ctx.save();
  ctx.globalAlpha = clampInt(opacityPercent, 8, 100, 100) / 100;
  ctx.drawImage(image, x, y, boxWidth, boxHeight);
  ctx.restore();
}

function readPdfStyle() {
  return {
    paper: hexColor(document.getElementById('pdf-paper').value, PDF_DEFAULT.paper),
    ink: hexColor(document.getElementById('pdf-ink').value, PDF_DEFAULT.ink),
    muted: hexColor(document.getElementById('pdf-muted').value, PDF_DEFAULT.muted),
    accent: hexColor(document.getElementById('pdf-accent').value, PDF_DEFAULT.accent),
    page: PDF_PAPER[document.getElementById('pdf-page').value] ? document.getElementById('pdf-page').value : 'a4',
    orientation: document.getElementById('pdf-orientation').value === 'landscape' ? 'landscape' : 'portrait',
    size: document.getElementById('pdf-size').value || 'm',
    margin: document.getElementById('pdf-margin').value || 'm',
    image: imagePercent(document.getElementById('pdf-image').value),
    titleColor: hexColor(document.getElementById('pdf-title-color').value, PDF_DEFAULT.titleColor),
    titleSize: clampInt(document.getElementById('pdf-title-size').value, 14, 40, PDF_DEFAULT.titleSize),
    titleBold: document.getElementById('pdf-title-bold').checked,
    titleAlign: textAlign(document.getElementById('pdf-title-align').value, PDF_DEFAULT.titleAlign),
    stepColor: hexColor(document.getElementById('pdf-step-color').value, PDF_DEFAULT.stepColor),
    stepSize: clampInt(document.getElementById('pdf-step-size').value, 14, 40, PDF_DEFAULT.stepSize),
    stepBold: document.getElementById('pdf-step-bold').checked,
    stepAlign: textAlign(document.getElementById('pdf-step-align').value, PDF_DEFAULT.stepAlign),
    noteColor: hexColor(document.getElementById('pdf-note-color').value, PDF_DEFAULT.noteColor),
    noteSize: clampInt(document.getElementById('pdf-note-size').value, 12, 32, PDF_DEFAULT.noteSize),
    noteBold: document.getElementById('pdf-note-bold').checked,
    blockGap: clampInt(document.getElementById('pdf-block-gap').value, 0, 48, PDF_DEFAULT.blockGap),
    lineGap: clampInt(document.getElementById('pdf-line-gap').value, 0, 32, PDF_DEFAULT.lineGap),
    stepsPerPage: setStepsPerPage(document.getElementById('pdf-steps').value),
    showStepUrl: document.getElementById('pdf-url').checked,
    showRecordedAt: document.getElementById('pdf-time').checked,
    showTitleUrls: document.getElementById('pdf-title-urls').checked,
    showLabels: document.getElementById('pdf-labels').checked,
    signOff: String(document.getElementById('pdf-sign').value || '').replace(/\r/g, '').trim().slice(0, 240),
    logo: pdfMarkData.logo,
    logoMode: pdfMarkData.logoMode,
    logoPosition: markPosition(
      document.getElementById('pdf-logo-position').value,
      PDF_DEFAULT.logoPosition,
    ),
    logoSize: clampInt(document.getElementById('pdf-logo-size').value, 8, 40, PDF_DEFAULT.logoSize),
    watermark: pdfMarkData.watermark,
    watermarkPosition: markPosition(
      document.getElementById('pdf-watermark-position').value,
      PDF_DEFAULT.watermarkPosition,
    ),
    watermarkSize: clampInt(
      document.getElementById('pdf-watermark-size').value,
      16,
      70,
      PDF_DEFAULT.watermarkSize,
    ),
    watermarkOpacity: clampInt(
      document.getElementById('pdf-watermark-opacity').value,
      8,
      70,
      PDF_DEFAULT.watermarkOpacity,
    ),
  };
}

function migratePdfStyle(style) {
  const saved = Object.assign({}, style || {});
  const classic = saved.paper === '#f7f4ee' && saved.ink === '#1c1915' && saved.accent === '#c2410c';
  const plain = saved.paper === '#ffffff' && saved.ink === '#1b1b1f' && saved.accent === '#3d348b';
  if (Number(saved.stepSize) === 18 && Number(saved.noteSize) === 14) {
    saved.stepSize = PDF_DEFAULT.stepSize;
    saved.noteSize = PDF_DEFAULT.noteSize;
  }
  if (!classic && !plain) return saved;
  const oldText = classic ? '#1c1915' : '#1b1b1f';
  saved.paper = PDF_DEFAULT.paper;
  saved.ink = PDF_DEFAULT.ink;
  saved.muted = PDF_DEFAULT.muted;
  saved.accent = PDF_DEFAULT.accent;
  if (!saved.titleColor || saved.titleColor === oldText) saved.titleColor = PDF_DEFAULT.titleColor;
  if (!saved.stepColor || saved.stepColor === oldText) saved.stepColor = PDF_DEFAULT.stepColor;
  if (!saved.noteColor || saved.noteColor === oldText) saved.noteColor = PDF_DEFAULT.noteColor;
  if (classic) {
    if (saved.titleSize == null || Number(saved.titleSize) === 22) saved.titleSize = PDF_DEFAULT.titleSize;
    if (saved.stepSize == null || Number(saved.stepSize) === 28) saved.stepSize = PDF_DEFAULT.stepSize;
    if (saved.noteSize == null || Number(saved.noteSize) === 18) saved.noteSize = PDF_DEFAULT.noteSize;
    if (saved.blockGap == null || Number(saved.blockGap) === 12) saved.blockGap = PDF_DEFAULT.blockGap;
    if (saved.lineGap == null || Number(saved.lineGap) === 8) saved.lineGap = PDF_DEFAULT.lineGap;
  }
  return saved;
}

function applyPdfStyle(style) {
  const saved = migratePdfStyle(style);
  const next = Object.assign({}, PDF_DEFAULT, saved);
  document.getElementById('pdf-paper').value = hexColor(next.paper, PDF_DEFAULT.paper);
  document.getElementById('pdf-ink').value = hexColor(next.ink, PDF_DEFAULT.ink);
  document.getElementById('pdf-muted').value = hexColor(next.muted, PDF_DEFAULT.muted);
  document.getElementById('pdf-accent').value = hexColor(next.accent, PDF_DEFAULT.accent);
  document.getElementById('pdf-page').value = PDF_PAPER[next.page] ? next.page : 'a4';
  document.getElementById('pdf-orientation').value = next.orientation === 'landscape' ? 'landscape' : 'portrait';
  document.getElementById('pdf-size').value = next.size === 's' || next.size === 'l' ? next.size : 'm';
  document.getElementById('pdf-margin').value = next.margin === 's' || next.margin === 'l' ? next.margin : 'm';
  setImagePercent(next.image);
  document.getElementById('pdf-title-color').value = hexColor(next.titleColor, PDF_DEFAULT.titleColor);
  setRange('pdf-title-size', 'pdf-title-size-label', next.titleSize, 14, 40, PDF_DEFAULT.titleSize, '');
  document.getElementById('pdf-title-bold').checked = next.titleBold !== false;
  document.getElementById('pdf-title-align').value = textAlign(next.titleAlign, PDF_DEFAULT.titleAlign);
  const stepColor = hexColor(saved.stepColor, hexColor(saved.titleColor, PDF_DEFAULT.stepColor));
  document.getElementById('pdf-step-color').value = stepColor;
  const stepSize = saved.stepSize == null ? PDF_DEFAULT.stepSize : saved.stepSize;
  setRange('pdf-step-size', 'pdf-step-size-label', stepSize, 14, 40, PDF_DEFAULT.stepSize, '');
  const stepBold = saved.stepBold == null ? saved.titleBold !== false : saved.stepBold !== false;
  document.getElementById('pdf-step-bold').checked = stepBold;
  document.getElementById('pdf-step-align').value = textAlign(next.stepAlign, PDF_DEFAULT.stepAlign);
  document.getElementById('pdf-note-color').value = hexColor(next.noteColor, PDF_DEFAULT.noteColor);
  setRange('pdf-note-size', 'pdf-note-size-label', next.noteSize, 12, 32, PDF_DEFAULT.noteSize, '');
  document.getElementById('pdf-note-bold').checked = next.noteBold === true;
  setRange('pdf-block-gap', 'pdf-block-gap-label', next.blockGap, 0, 48, PDF_DEFAULT.blockGap, '');
  setRange('pdf-line-gap', 'pdf-line-gap-label', next.lineGap, 0, 32, PDF_DEFAULT.lineGap, '');
  setStepsPerPage(next.stepsPerPage);
  document.getElementById('pdf-url').checked = next.showStepUrl === true;
  document.getElementById('pdf-time').checked = next.showRecordedAt === true;
  document.getElementById('pdf-title-urls').checked = next.showTitleUrls === true;
  document.getElementById('pdf-labels').checked = next.showLabels !== false;
  document.getElementById('pdf-sign').value = String(next.signOff || '').slice(0, 240);
  const customLogo = imageDataUrl(saved.logo);
  if (saved.logoMode === 'none') {
    pdfMarkData.logo = '';
    pdfMarkData.logoMode = 'none';
  } else if (saved.logoMode !== 'default' && customLogo) {
    pdfMarkData.logo = customLogo;
    pdfMarkData.logoMode = 'custom';
  } else {
    pdfMarkData.logo = defaultLogoUrl;
    pdfMarkData.logoMode = 'default';
    if (!defaultLogoUrl) loadDefaultLogo();
  }
  pdfMarkData.watermark = imageDataUrl(next.watermark);
  document.getElementById('pdf-logo-file').value = '';
  document.getElementById('pdf-watermark-file').value = '';
  document.getElementById('pdf-logo-position').value = markPosition(next.logoPosition, PDF_DEFAULT.logoPosition);
  document.getElementById('pdf-watermark-position').value = markPosition(
    next.watermarkPosition,
    PDF_DEFAULT.watermarkPosition,
  );
  setRange('pdf-logo-size', 'pdf-logo-size-label', next.logoSize, 8, 40, PDF_DEFAULT.logoSize, '%');
  setRange(
    'pdf-watermark-size',
    'pdf-watermark-size-label',
    next.watermarkSize,
    16,
    70,
    PDF_DEFAULT.watermarkSize,
    '%',
  );
  setRange(
    'pdf-watermark-opacity',
    'pdf-watermark-opacity-label',
    next.watermarkOpacity,
    8,
    70,
    PDF_DEFAULT.watermarkOpacity,
    '%',
  );
  paintMarkState();
}

function savePdfStyle() {
  chrome.storage.local.set({ pdfStyle: readPdfStyle() }, () => {
    if (chrome.runtime.lastError) {
      document.getElementById('status').textContent = '商标或水印没有记住。请换一张小一点的图片。';
    }
  },);
}

const PANEL_THEMES = {
  paper: { paper: '#f3f1fb', ink: '#241b4a', accent: '#5b46f5' },
  light: { paper: '#ffffff', ink: '#171717', accent: '#1d4ed8' },
  dark: { paper: '#1c1917', ink: '#f6f1e8', accent: '#fb923c' },
  contrast: { paper: '#ffffff', ink: '#000000', accent: '#b91c1c' },
};

const PANEL_DEFAULT = {
  theme: 'paper',
  paper: '#f3f1fb',
  ink: '#241b4a',
  accent: '#5b46f5',
  fontSize: 13,
  spacing: 14,
  leading: 145,
  radius: 14,
  transparency: 0,
  titleColor: '#241b4a',
  titleSize: 18,
  titleBold: true,
  stepTitleColor: '#241b4a',
  stepTitleSize: 18,
  stepTitleBold: true,
  noteColor: '#241b4a',
  noteSize: 13,
  noteBold: false,
};

function hexToRgb(hex) {
  const value = hexColor(hex, '#000000').slice(1);
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function mixHex(from, to, amount) {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  return '#' + [0, 1, 2].map((index) => {
    return Math.round(start[index] + (end[index] - start[index]) * amount).toString(16).padStart(2, '0');
  },).join('');
}

function paperLuminance(hex) {
  const channels = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  },);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function setTransparency(value) {
  const next = clampInt(value, 0, 60, PANEL_DEFAULT.transparency);
  document.getElementById('panel-opacity').value = String(next);
  document.getElementById('panel-opacity-label').textContent = next + '%';
  return next;
}

function setLeading(value) {
  const next = clampInt(value, 120, 200, PANEL_DEFAULT.leading);
  document.getElementById('panel-leading').value = String(next);
  document.getElementById('panel-leading-label').textContent = (next / 100).toFixed(2);
  return next;
}

function readPanelStyle() {
  const themeName = document.getElementById('panel-theme').value;
  const theme = PANEL_THEMES[themeName] ? themeName : 'paper';
  return {
    theme,
    paper: hexColor(document.getElementById('panel-paper').value, PANEL_DEFAULT.paper),
    ink: hexColor(document.getElementById('panel-ink').value, PANEL_DEFAULT.ink),
    accent: hexColor(document.getElementById('panel-accent').value, PANEL_DEFAULT.accent),
    fontSize: clampInt(document.getElementById('panel-font').value, 12, 20, PANEL_DEFAULT.fontSize),
    spacing: clampInt(document.getElementById('panel-space').value, 8, 28, PANEL_DEFAULT.spacing),
    leading: clampInt(document.getElementById('panel-leading').value, 120, 200, PANEL_DEFAULT.leading),
    radius: clampInt(document.getElementById('panel-radius').value, 0, 16, PANEL_DEFAULT.radius),
    transparency: setTransparency(document.getElementById('panel-opacity').value),
    titleColor: hexColor(document.getElementById('panel-title-color').value, PANEL_DEFAULT.titleColor),
    titleSize: clampInt(document.getElementById('panel-title-size').value, 14, 36, PANEL_DEFAULT.titleSize),
    titleBold: document.getElementById('panel-title-bold').checked,
    stepTitleColor: hexColor(
      document.getElementById('panel-step-title-color').value,
      PANEL_DEFAULT.stepTitleColor,
    ),
    stepTitleSize: clampInt(
      document.getElementById('panel-step-title-size').value,
      14,
      36,
      PANEL_DEFAULT.stepTitleSize,
    ),
    stepTitleBold: document.getElementById('panel-step-title-bold').checked,
    noteColor: hexColor(document.getElementById('panel-note-color').value, PANEL_DEFAULT.noteColor),
    noteSize: clampInt(document.getElementById('panel-note-size').value, 12, 28, PANEL_DEFAULT.noteSize),
    noteBold: document.getElementById('panel-note-bold').checked,
  };
}

function paintPanel(style) {
  const paper = hexColor(style.paper, PANEL_DEFAULT.paper);
  const ink = hexColor(style.ink, PANEL_DEFAULT.ink);
  const accent = hexColor(style.accent, PANEL_DEFAULT.accent);
  const fontSize = clampInt(style.fontSize, 12, 20, PANEL_DEFAULT.fontSize);
  const spacing = clampInt(style.spacing, 8, 28, PANEL_DEFAULT.spacing);
  const leading = clampInt(style.leading, 120, 200, PANEL_DEFAULT.leading);
  const radius = clampInt(style.radius, 0, 16, PANEL_DEFAULT.radius);
  const titleSize = clampInt(style.titleSize, 14, 36, PANEL_DEFAULT.titleSize);
  const noteSize = clampInt(style.noteSize, 12, 28, PANEL_DEFAULT.noteSize);
  const root = document.documentElement;
  const dark = paperLuminance(paper) < 0.35;
  const classic = paper.toLowerCase() === '#f3f1fb' && ink.toLowerCase() === '#241b4a';
  root.style.colorScheme = dark ? 'dark' : 'light';
  const transparency = clampInt(style.transparency, 0, 60, PANEL_DEFAULT.transparency);
  const alpha = (100 - transparency) / 100;
  document.getElementById('panel-shell').style.opacity = String(alpha);
  root.style.setProperty('--paper', paper);
  root.style.setProperty('--paper-fill', paper);
  root.style.setProperty('--ink', ink);
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--muted', classic ? '#6d678c' : mixHex(ink, paper, 0.42));
  root.style.setProperty('--line', classic ? '#ddd7f0' : mixHex(ink, paper, 0.82));
  let surface = mixHex(paper, '#ffffff', 0.72);
  if (dark) surface = mixHex(paper, ink, 0.12);
  else if (classic) surface = '#ffffff';
  root.style.setProperty('--surface', surface);
  root.style.setProperty('--surface-fill', surface);
  root.style.setProperty('--font-size', fontSize + 'px');
  root.style.setProperty('--title-color', hexColor(style.titleColor, PANEL_DEFAULT.titleColor));
  root.style.setProperty('--title-size', titleSize + 'px');
  root.style.setProperty('--title-weight', style.titleBold === false ? '400' : '600');
  const stepTitleSize = clampInt(style.stepTitleSize, 14, 36, titleSize);
  const stepTitleBold = style.stepTitleBold == null ? style.titleBold !== false : style.stepTitleBold !== false;
  root.style.setProperty(
    '--step-title-color',
    hexColor(style.stepTitleColor, hexColor(style.titleColor, PANEL_DEFAULT.stepTitleColor)),
  );
  root.style.setProperty('--step-title-size', stepTitleSize + 'px');
  root.style.setProperty('--step-title-weight', stepTitleBold ? '600' : '400');
  root.style.setProperty('--note-color', hexColor(style.noteColor, PANEL_DEFAULT.noteColor));
  root.style.setProperty('--note-size', noteSize + 'px');
  root.style.setProperty('--note-weight', style.noteBold ? '600' : '400');
  root.style.setProperty('--line-height', (leading / 100).toFixed(2));
  root.style.setProperty('--pad-x', spacing + 'px');
  root.style.setProperty('--pad-y', Math.max(8, spacing - 2) + 'px');
  root.style.setProperty('--gap', Math.max(4, Math.round(spacing * 0.57)) + 'px');
  root.style.setProperty('--step-gap', Math.max(6, Math.round(spacing * 0.86)) + 'px');
  root.style.setProperty('--radius', radius + 'px');
}

function panelLook(style) {
  const saved = Object.assign({}, style || {});
  const oldPaper = String(saved.paper || '').toLowerCase() === '#f7f4ee';
  const oldInk = String(saved.ink || '').toLowerCase() === '#1c1915';
  const oldAccent = String(saved.accent || '').toLowerCase() === '#c2410c';
  const theme = saved.theme || 'paper';
  if (theme === 'paper' && oldPaper && oldInk && oldAccent) {
    saved.paper = PANEL_DEFAULT.paper;
    saved.ink = PANEL_DEFAULT.ink;
    saved.accent = PANEL_DEFAULT.accent;
    if (String(saved.titleColor || '#1c1915').toLowerCase() === '#1c1915') {
      saved.titleColor = PANEL_DEFAULT.titleColor;
    }
    if (String(saved.stepTitleColor || '#1c1915').toLowerCase() === '#1c1915') {
      saved.stepTitleColor = PANEL_DEFAULT.stepTitleColor;
    }
    if (String(saved.noteColor || '#1c1915').toLowerCase() === '#1c1915') {
      saved.noteColor = PANEL_DEFAULT.noteColor;
    }
    if (saved.radius == null || Number(saved.radius) === 8) saved.radius = PANEL_DEFAULT.radius;
  }
  return saved;
}

function applyPanelStyle(style) {
  const saved = panelLook(style);
  const next = Object.assign({}, PANEL_DEFAULT, saved);
  const theme = PANEL_THEMES[next.theme] ? next.theme : 'paper';
  document.getElementById('panel-theme').value = theme;
  document.getElementById('panel-paper').value = hexColor(next.paper, PANEL_DEFAULT.paper);
  document.getElementById('panel-ink').value = hexColor(next.ink, PANEL_DEFAULT.ink);
  document.getElementById('panel-accent').value = hexColor(next.accent, PANEL_DEFAULT.accent);
  setRange('panel-font', 'panel-font-label', next.fontSize, 12, 20, PANEL_DEFAULT.fontSize, '');
  setRange('panel-space', 'panel-space-label', next.spacing, 8, 28, PANEL_DEFAULT.spacing, '');
  setLeading(next.leading);
  setRange('panel-radius', 'panel-radius-label', next.radius, 0, 16, PANEL_DEFAULT.radius, '');
  setTransparency(next.transparency);
  document.getElementById('panel-title-color').value = hexColor(next.titleColor, PANEL_DEFAULT.titleColor);
  setRange('panel-title-size', 'panel-title-size-label', next.titleSize, 14, 36, PANEL_DEFAULT.titleSize, '');
  document.getElementById('panel-title-bold').checked = next.titleBold !== false;
  const stepTitleColor = hexColor(
    saved.stepTitleColor,
    hexColor(saved.titleColor, PANEL_DEFAULT.stepTitleColor),
  );
  document.getElementById('panel-step-title-color').value = stepTitleColor;
  const stepTitleSize = saved.stepTitleSize == null ? saved.titleSize : saved.stepTitleSize;
  setRange(
    'panel-step-title-size',
    'panel-step-title-size-label',
    stepTitleSize,
    14,
    36,
    PANEL_DEFAULT.stepTitleSize,
    '',
  );
  const stepTitleBold = saved.stepTitleBold == null ? saved.titleBold !== false : saved.stepTitleBold !== false;
  document.getElementById('panel-step-title-bold').checked = stepTitleBold;
  document.getElementById('panel-note-color').value = hexColor(next.noteColor, PANEL_DEFAULT.noteColor);
  setRange('panel-note-size', 'panel-note-size-label', next.noteSize, 12, 28, PANEL_DEFAULT.noteSize, '');
  document.getElementById('panel-note-bold').checked = next.noteBold === true;
  paintPanel(readPanelStyle());
}

function savePanelStyle() {
  chrome.storage.local.set({ panelStyle: readPanelStyle() });
}

function recordedAtText(value) {
  const time = Number(value);
  if (!time) return '';
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return '';
  return '录制时间：' + date.toLocaleString('zh-CN');
}

function involvedUrls(steps) {
  const urls = [];
  (steps || []).forEach((step) => {
    const url = String((step && step.url) || '').trim();
    if (/^https?:\/\//i.test(url) && urls.indexOf(url) < 0) urls.push(url);
  },);
  return urls;
}

function paperSheet(style) {
  const pair = PDF_PAPER[style.page] || PDF_PAPER.a4;
  const longSide = Math.max(pair[0], pair[1]);
  const shortSide = Math.min(pair[0], pair[1]);
  const landscape = style.orientation === 'landscape';
  const pageWidth = landscape ? longSide : shortSide;
  const pageHeight = landscape ? shortSide : longSide;
  const dpi = 288;
  return {
    pageWidth,
    pageHeight,
    width: Math.round((pageWidth * dpi) / 72),
    height: Math.round((pageHeight * dpi) / 72),
    unit: dpi / 96,
  };
}

async function canvasToPdfImage(canvas) {
  const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const rgb = new Uint8Array((image.data.length / 4) * 3);
  const src = image.data;
  for (let i = 0, j = 0; i < src.length; i += 4, j += 3) {
    rgb[j] = src[i];
    rgb[j + 1] = src[i + 1];
    rgb[j + 2] = src[i + 2];
  }
  const stream = new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const preview = await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('无法生成 PDF 页面'));
        return;
      }
      resolve(blob);
    }, 'image/png',);
  },);
  return { bytes, preview };
}

function pushPaperPages(sheets, source, sheet, paperColor, stamp, footerBand, contentTop) {
  const firstBody = Math.max(1, sheet.height - footerBand);
  const nextBody = Math.max(1, sheet.height - footerBand - contentTop);
  let offset = 0;
  let index = 0;
  while (offset < source.height) {
    const bodyH = index === 0 ? firstBody : nextBody;
    const destY = index === 0 ? 0 : contentTop;
    const piece = document.createElement('canvas');
    piece.width = sheet.width;
    piece.height = sheet.height;
    const ctx = piece.getContext('2d');
    ctx.fillStyle = paperColor;
    ctx.fillRect(0, 0, piece.width, piece.height);
    const sliceHeight = Math.min(bodyH, source.height - offset);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, offset, source.width, sliceHeight, 0, destY, source.width, sliceHeight);
    if (stamp) stamp(ctx, piece.width, piece.height);
    sheets.push({ canvas: piece, contentBottom: destY + sliceHeight });
    offset += sliceHeight;
    index += 1;
  }
}

async function renderPdfPages(guide, style) {
  const sheet = paperSheet(style);
  const width = sheet.width;
  const unit = sheet.unit;
  function u(value) {
    return Math.round(value * unit);
  }
  let scale = 1;
  if (style.size === 's') scale = 0.85;
  else if (style.size === 'l') scale = 1.22;
  let marginPt = 48;
  if (style.margin === 's') marginPt = 32;
  else if (style.margin === 'l') marginPt = 72;
  const pad = Math.max(u(24), Math.round(marginPt * (width / 794)));
  const footerBand = Math.min(pad, Math.max(u(32), Math.round(pad * 0.62)));
  const contentWidth = width - pad * 2;
  const font = 'PingFang SC, Noto Sans SC, sans-serif';
  function px(value) {
    return Math.max(u(12), Math.round(value * scale * unit));
  }
  const labelSize = px(14);
  const docSize = px(style.titleSize);
  const headSize = px(style.stepSize);
  const bodySize = px(style.noteSize);
  const urlSize = px(16);
  const titleWeight = style.titleBold === false ? '400 ' : '600 ';
  const stepIsBold = style.stepBold == null ? style.titleBold !== false : style.stepBold !== false;
  const stepWeight = stepIsBold ? '600 ' : '400 ';
  const stepColor = hexColor(style.stepColor, hexColor(style.titleColor, PDF_DEFAULT.stepColor));
  const noteWeight = style.noteBold ? '600 ' : '400 ';
  const blockGap = Math.max(0, Math.round(clampInt(style.blockGap, 0, 48, 12) * scale * unit));
  const lineGap = Math.max(0, Math.round(clampInt(style.lineGap, 0, 32, 8) * scale * unit));
  const showLabels = style.showLabels !== false;
  const titleAlign = textAlign(style.titleAlign, 'left');
  const stepAlign = textAlign(style.stepAlign, 'left');
  function alignedX(textWidth, align) {
    if (align === 'center') return pad + Math.round((contentWidth - textWidth) / 2);
    if (align === 'right') return pad + Math.max(0, contentWidth - textWidth);
    return pad;
  }
  const stepsPerPage = clampInt(style.stepsPerPage, 1, 20, 1);
  const marks = {
    logo: await loadPdfImage(style.logo),
    watermark: await loadPdfImage(style.watermark),
  };
  function drawPageLogo(ctx, pageWidth, bandHeight) {
    const image = marks.logo;
    const anchor = MARK_POSITIONS[style.logoPosition];
    if (!image || !anchor || bandHeight < 8) return;
    const margin = Math.round(pageWidth * 0.04);
    const band = Math.max(8, bandHeight - u(12));
    let boxHeight = band;
    let boxWidth = Math.round(boxHeight * (image.width / image.height)) || 1;
    const maxWidth = Math.round(pageWidth * (clampInt(style.logoSize, 8, 40, 16) / 100));
    if (boxWidth > maxWidth) {
      boxWidth = maxWidth;
      boxHeight = Math.max(1, Math.round(boxWidth * (image.height / image.width)));
    }
    if (boxHeight > band) {
      boxHeight = band;
      boxWidth = Math.max(1, Math.round(boxHeight * (image.width / image.height)));
    }
    const x = margin + anchor[0] * (pageWidth - margin * 2 - boxWidth);
    const y = Math.max(u(6), Math.round((bandHeight - boxHeight) / 2));
    ctx.drawImage(image, x, y, boxWidth, boxHeight);
  }
  function stampPage(ctx, pageWidth, pageHeight) {
    drawStoredMark(
      ctx,
      marks.watermark,
      pageWidth,
      pageHeight,
      style.watermarkPosition,
      style.watermarkSize,
      style.watermarkOpacity,
    );
    drawPageLogo(ctx, pageWidth, Math.min(pad, pageHeight * 0.16));
  }
  const headGap = headSize + lineGap;
  const bodyGap = bodySize + lineGap;
  const badge = Math.max(u(18), Math.round(headSize * 0.86));
  const badgeGap = Math.round(badge * 0.4);
  const labelGap = labelSize + lineGap;
  const steps = guide.steps && guide.steps.length
    ? guide.steps
    : [{ text: '没有步骤', url: '', image: null }];
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = titleWeight + docSize + 'px ' + font;
  const titleLines = wrapPdfText(measure, displayTitle(guide), contentWidth);
  measure.font = urlSize + 'px ' + font;
  const timeSource = style.showRecordedAt ? recordedAtText(guide.startedAt) : '';
  const timeLines = timeSource ? wrapPdfText(measure, timeSource, contentWidth) : [];
  const urlLines = [];
  if (style.showTitleUrls) {
    involvedUrls(guide.steps).forEach((url) => {
      wrapPdfText(measure, url, contentWidth).forEach((line) => {
        urlLines.push(line);
      },);
    },);
  }
  measure.font = noteWeight + bodySize + 'px ' + font;
  const intro = guide.description ? wrapPdfText(measure, guide.description, contentWidth) : [];
  const prepared = [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const image = await loadPdfImage(step.image);
    const digits = String(index + 1);
    measure.font = '600 ' + Math.round(badge * 0.52) + 'px ' + font;
    const digitWidth = measure.measureText(digits).width;
    const badgeWidth = Math.max(badge, Math.round(digitWidth + badge * 0.7));
    const numberWidth = badgeWidth + badgeGap;
    const cardPad = image ? u(16) : 0;
    const colGap = image ? u(22) : 0;
    const innerW = Math.max(1, contentWidth - cardPad * 2);
    let left = image ? Math.round((innerW - colGap) * 0.42) : contentWidth;
    let right = image ? innerW - colGap - left : 0;
    if (image && left < numberWidth + u(48)) {
      left = numberWidth + u(48);
      right = Math.max(u(80), innerW - colGap - left);
    }
    const wrapWidth = Math.max(u(40), stepAlign === 'left' ? left - numberWidth : left);
    measure.font = stepWeight + headSize + 'px ' + font;
    const headingLines = wrapPdfText(measure, step.text || '', wrapWidth);
    measure.font = noteWeight + bodySize + 'px ' + font;
    const notes = step.note ? wrapPdfText(measure, step.note, wrapWidth) : [];
    measure.font = urlSize + 'px ' + font;
    const links = style.showStepUrl && step.url ? wrapPdfText(measure, step.url, wrapWidth) : [];
    const fullWidth = image
      ? Math.max(u(40), Math.round(right * (imagePercent(style.image) / 100)))
      : 0;
    const fullHeight = image ? Math.round(fullWidth * (image.height / image.width)) : 0;
    prepared.push({
      index,
      step,
      image,
      badgeWidth,
      numberWidth,
      cardPad,
      colGap,
      left,
      right,
      headingLines,
      notes,
      links,
      fullWidth,
      fullHeight,
    });
  }

  function copyHeight(item) {
    let height = Math.max(1, item.headingLines.length) * headGap;
    if (item.notes.length) {
      height += u(10) + (showLabels ? labelGap : 0) + item.notes.length * bodyGap;
    }
    if (item.links.length) height += blockGap + item.links.length * (urlSize + lineGap);
    return height;
  }

  function rowSpan(item, imageH) {
    const copyH = copyHeight(item);
    if (item.image && imageH > 0) return item.cardPad * 2 + Math.max(copyH, imageH);
    if (!item.image) return copyH + u(36);
    return copyH;
  }

  function metaHeight() {
    if (!timeLines.length && !urlLines.length) return 0;
    let height = timeLines.length * (urlSize + lineGap);
    if (urlLines.length) height += labelGap + urlLines.length * (urlSize + lineGap);
    return height + blockGap;
  }

  function docHeight() {
    const titleBlock = titleLines.length * docSize + Math.max(0, titleLines.length - 1) * lineGap;
    let height = titleBlock + blockGap + metaHeight();
    if (intro.length) {
      height += (showLabels ? labelGap : 0) + intro.length * bodyGap + blockGap;
    }
    return height;
  }

  function drawDoc(ctx, y) {
    ctx.textBaseline = 'top';
    ctx.fillStyle = style.titleColor;
    ctx.font = titleWeight + docSize + 'px ' + font;
    titleLines.forEach((line, index) => {
      ctx.fillText(line, alignedX(ctx.measureText(line).width, titleAlign), y);
      y += docSize;
      if (index < titleLines.length - 1) y += lineGap;
    },);
    const ruleGap = Math.round(blockGap * 0.4);
    y += ruleGap;
    ctx.save();
    ctx.strokeStyle = style.muted;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(1, Math.round(unit));
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(pad + contentWidth, y);
    ctx.stroke();
    ctx.restore();
    y += blockGap - ruleGap;
    if (timeLines.length || urlLines.length) {
      ctx.fillStyle = style.muted;
      ctx.font = urlSize + 'px ' + font;
      timeLines.forEach((line) => {
        ctx.fillText(line, alignedX(ctx.measureText(line).width, titleAlign), y);
        y += urlSize + lineGap;
      },);
      if (urlLines.length) {
        ctx.font = labelSize + 'px ' + font;
        ctx.fillText('涉及网址', alignedX(ctx.measureText('涉及网址').width, titleAlign), y);
        y += labelGap;
        ctx.font = urlSize + 'px ' + font;
        urlLines.forEach((line) => {
          ctx.fillText(line, alignedX(ctx.measureText(line).width, titleAlign), y);
          y += urlSize + lineGap;
        },);
      }
      y += blockGap;
    }
    if (!intro.length) return y;
    if (showLabels) {
      ctx.fillStyle = style.muted;
      ctx.font = labelSize + 'px ' + font;
      ctx.fillText('说明', pad, y);
      y += labelGap;
    }
    ctx.fillStyle = style.noteColor;
    ctx.font = noteWeight + bodySize + 'px ' + font;
    intro.forEach((line) => {
      ctx.fillText(line, pad, y);
      y += bodyGap;
    },);
    return y + blockGap;
  }

  function alignedIn(textWidth, align, origin, columnWidth) {
    if (align === 'center') return origin + Math.round((columnWidth - textWidth) / 2);
    if (align === 'right') return origin + Math.max(0, columnWidth - textWidth);
    return origin;
  }

  function drawStepBadge(ctx, n, x, y, badgeWidth) {
    ctx.save();
    ctx.fillStyle = style.accent;
    ctx.beginPath();
    ctx.roundRect(x, y + Math.round((headSize - badge) / 2), badgeWidth, badge, badge / 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 ' + Math.round(badge * 0.52) + 'px ' + font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x + badgeWidth / 2, y + headSize / 2);
    ctx.restore();
  }

  function drawFramedShot(ctx, image, x, y, w, h) {
    const radius = Math.max(u(6), Math.round(Math.min(w, h) * 0.012));
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, x, y, w, h);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.strokeStyle = style.muted;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(1, Math.round(unit));
    ctx.stroke();
    ctx.restore();
  }

  function drawStepCard(ctx, x, y, w, h) {
    const radius = u(14);
    ctx.save();
    ctx.shadowColor = 'rgba(36, 27, 74, 0.10)';
    ctx.shadowBlur = u(12);
    ctx.shadowOffsetY = u(6);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.strokeStyle = style.accent;
    ctx.globalAlpha = 0.14;
    ctx.lineWidth = Math.max(1, Math.round(unit));
    ctx.stroke();
    ctx.restore();
  }

  function drawStep(ctx, item, imageWidth, imageHeight, y) {
    const copyH = copyHeight(item);
    const hasShot = Boolean(item.image && imageHeight > 0);
    const innerH = hasShot ? Math.max(copyH, imageHeight) : copyH;
    const cardH = hasShot ? item.cardPad * 2 + innerH : 0;
    if (hasShot) drawStepCard(ctx, pad, y, contentWidth, cardH);
    const origin = pad + (hasShot ? item.cardPad : 0);
    const column = hasShot ? item.left : contentWidth;
    const innerTop = y + (hasShot ? item.cardPad : 0);
    let cursor = innerTop;
    ctx.textBaseline = 'top';
    ctx.font = stepWeight + headSize + 'px ' + font;
    const headingText = item.headingLines.length ? item.headingLines : [''];
    headingText.forEach((line, lineIndex) => {
      const lineWidth = ctx.measureText(line).width;
      if (lineIndex === 0) {
        const x = alignedIn(item.numberWidth + lineWidth, stepAlign, origin, column);
        drawStepBadge(ctx, item.index + 1, x, cursor, item.badgeWidth);
        ctx.fillStyle = stepColor;
        ctx.font = stepWeight + headSize + 'px ' + font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(line, x + item.numberWidth, cursor);
      } else {
        const x = stepAlign === 'left'
          ? origin + item.numberWidth
          : alignedIn(lineWidth, stepAlign, origin, column);
        ctx.fillStyle = stepColor;
        ctx.fillText(line, x, cursor);
      }
      cursor += headGap;
    },);
    const bodyX = stepAlign === 'left' ? origin + item.numberWidth : origin;
    if (item.notes.length) {
      cursor += u(10);
      if (showLabels) {
        ctx.fillStyle = style.muted;
        ctx.font = labelSize + 'px ' + font;
        ctx.fillText('说明', bodyX, cursor);
        cursor += labelGap;
      }
      ctx.fillStyle = style.noteColor;
      ctx.font = noteWeight + bodySize + 'px ' + font;
      item.notes.forEach((line) => {
        ctx.fillText(line, bodyX, cursor);
        cursor += bodyGap;
      },);
    }
    if (item.links.length) {
      cursor += blockGap;
      ctx.fillStyle = style.muted;
      ctx.font = urlSize + 'px ' + font;
      item.links.forEach((line) => {
        ctx.fillText(line, bodyX, cursor);
        cursor += urlSize + lineGap;
      },);
    }
    if (hasShot) {
      const imageX = origin + item.left + item.colGap + Math.round((item.right - imageWidth) / 2);
      drawFramedShot(ctx, item.image, imageX, innerTop, imageWidth, imageHeight);
      return y + cardH;
    }
    if (!item.image) {
      ctx.fillStyle = style.accent;
      ctx.font = urlSize + 'px ' + font;
      ctx.fillText(item.step.shotError || '这一步没有截到画面。', origin, cursor + u(8));
      return y + copyH + u(36);
    }
    return y + copyH;
  }

  function fitBox(item, maxHeight) {
    if (!item.image || maxHeight <= 0) return { w: 0, h: 0 };
    let boxWidth = item.fullWidth;
    let boxHeight = item.fullHeight;
    const pleasant = Math.round(item.fullWidth * 0.72);
    const limit = Math.min(maxHeight, pleasant);
    if (boxHeight > limit) {
      boxWidth = Math.max(1, Math.round(boxWidth * (limit / boxHeight)));
      boxHeight = limit;
    }
    if (item.right && boxWidth > item.right) {
      boxHeight = Math.max(1, Math.round(boxHeight * (item.right / boxWidth)));
      boxWidth = item.right;
    }
    return { w: boxWidth, h: boxHeight };
  }

  function fittedBoxes(chunk, includeDoc) {
    const inner = sheet.height - pad * 2 - (includeDoc ? docHeight() : 0);
    const room = inner - blockGap * Math.max(0, chunk.length - 1);
    let boxes = chunk.map((item) => {
      if (!item.image) return { w: 0, h: 0 };
      return { w: item.fullWidth, h: item.fullHeight };
    },);
    function total() {
      return chunk.reduce((sum, item, index) => sum + rowSpan(item, boxes[index].h), 0);
    }
    let guard = 8;
    while (total() > room && guard > 0) {
      guard -= 1;
      const heights = boxes.reduce((sum, box) => sum + box.h, 0);
      if (heights <= 0) return null;
      const scale = Math.max(0.45, (heights - (total() - room)) / heights);
      boxes = chunk.map((item, index) => {
        return fitBox(item, Math.max(1, Math.floor(boxes[index].h * scale)));
      },);
    }
    if (total() > room) return null;
    return boxes;
  }

  const sheets = [];
  async function emit(chunk, includeDoc, boxes, fitPage) {
    let contentHeight = pad;
    if (includeDoc) contentHeight += docHeight();
    chunk.forEach((item, index) => {
      if (index) contentHeight += blockGap;
      contentHeight += rowSpan(item, boxes[index].h);
    },);
    contentHeight += pad;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = fitPage ? sheet.height : Math.max(contentHeight, sheet.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = style.paper;
    ctx.fillRect(0, 0, width, canvas.height);
    let y = pad;
    if (includeDoc) y = drawDoc(ctx, y);
    chunk.forEach((item, index) => {
      if (index) y += blockGap;
      y = drawStep(ctx, item, boxes[index].w, boxes[index].h, y);
    },);
    if (fitPage) {
      stampPage(ctx, canvas.width, canvas.height);
      sheets.push({ canvas, contentBottom: y });
      return;
    }
    pushPaperPages(sheets, canvas, sheet, style.paper, stampPage, footerBand, pad);
  }

  async function emitScaled(chunk, includeDoc) {
    const boxes = chunk.map((item) => fitBox(item, u(160)));
    const source = document.createElement('canvas');
    let contentHeight = pad;
    if (includeDoc) contentHeight += docHeight();
    chunk.forEach((item, index) => {
      if (index) contentHeight += blockGap;
      contentHeight += rowSpan(item, boxes[index].h);
    },);
    contentHeight += pad;
    source.width = width;
    source.height = Math.max(1, contentHeight);
    const ctx = source.getContext('2d');
    ctx.fillStyle = style.paper;
    ctx.fillRect(0, 0, source.width, source.height);
    let y = pad;
    if (includeDoc) y = drawDoc(ctx, y);
    chunk.forEach((item, index) => {
      if (index) y += blockGap;
      y = drawStep(ctx, item, boxes[index].w, boxes[index].h, y);
    },);
    const page = document.createElement('canvas');
    page.width = width;
    page.height = sheet.height;
    const pageCtx = page.getContext('2d');
    pageCtx.fillStyle = style.paper;
    pageCtx.fillRect(0, 0, page.width, page.height);
    const scale = Math.min(1, sheet.height / source.height);
    const drawW = Math.max(1, Math.round(source.width * scale));
    const drawH = Math.max(1, Math.round(source.height * scale));
    const x = Math.round((width - drawW) / 2);
    pageCtx.imageSmoothingEnabled = true;
    pageCtx.imageSmoothingQuality = 'high';
    pageCtx.drawImage(source, x, 0, drawW, drawH);
    stampPage(pageCtx, page.width, page.height);
    sheets.push({ canvas: page, contentBottom: drawH });
  }

  for (let start = 0; start < prepared.length; start += stepsPerPage) {
    const chunk = prepared.slice(start, start + stepsPerPage);
    const includeDoc = start === 0;
    if (stepsPerPage === 1) {
      const inner = sheet.height - pad * 2 - (includeDoc ? docHeight() : 0);
      const boxes = chunk.map((item) => {
        if (!item.image) return { w: 0, h: 0 };
        return fitBox(item, Math.max(u(80), inner - item.cardPad * 2));
      },);
      const fits = rowSpan(chunk[0], boxes[0].h) <= inner;
      await emit(chunk, includeDoc, boxes, fits);
    } else {
      const boxes = fittedBoxes(chunk, includeDoc);
      if (boxes) {
        await emit(chunk, includeDoc, boxes, true);
      } else {
        await emitScaled(chunk, includeDoc);
      }
    }
  }

  function signLines() {
    const text = String(style.signOff || '').trim();
    if (!text) return [];
    const measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = noteWeight + bodySize + 'px ' + font;
    const lines = [];
    text.split('\n').forEach((part) => {
      wrapPdfText(measureCtx, part, Math.round(contentWidth * 0.72)).forEach((line) => {
        lines.push(line);
      },);
    },);
    return lines;
  }

  function paintSign(ctx, top, lines) {
    ctx.save();
    ctx.fillStyle = style.ink;
    ctx.font = noteWeight + bodySize + 'px ' + font;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    let cursor = top;
    lines.forEach((line) => {
      if (line) ctx.fillText(line, sheet.width - pad, cursor);
      cursor += bodyGap;
    },);
    ctx.restore();
    return cursor;
  }

  const closing = signLines();
  if (closing.length && sheets.length) {
    const needed = closing.length * bodyGap + u(8);
    const last = sheets[sheets.length - 1];
    const footerTop = sheet.height - footerBand;
    if (last.contentBottom + u(18) + needed <= footerTop - u(8)) {
      paintSign(last.canvas.getContext('2d'), last.contentBottom + u(18), closing);
    } else {
      const extra = document.createElement('canvas');
      extra.width = sheet.width;
      extra.height = sheet.height;
      const extraCtx = extra.getContext('2d');
      extraCtx.fillStyle = style.paper;
      extraCtx.fillRect(0, 0, extra.width, extra.height);
      stampPage(extraCtx, extra.width, extra.height);
      const bottom = paintSign(extraCtx, pad, closing);
      sheets.push({ canvas: extra, contentBottom: bottom });
    }
  }

  function drawPageFooter(ctx, index, total) {
    const lineY = sheet.height - footerBand;
    ctx.save();
    ctx.strokeStyle = style.muted;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(1, Math.round(unit));
    ctx.beginPath();
    ctx.moveTo(pad, lineY);
    ctx.lineTo(sheet.width - pad, lineY);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = style.muted;
    ctx.font = u(13) + 'px ' + font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((index + 1) + ' / ' + total, sheet.width / 2, lineY + footerBand / 2);
    ctx.restore();
  }

  const pages = [];
  for (let index = 0; index < sheets.length; index += 1) {
    const item = sheets[index];
    drawPageFooter(item.canvas.getContext('2d'), index, sheets.length);
    const image = await canvasToPdfImage(item.canvas);
    pages.push({
      bytes: image.bytes,
      preview: image.preview,
      width: item.canvas.width,
      height: item.canvas.height,
      pageWidth: Math.round(sheet.pageWidth),
      pageHeight: Math.round(sheet.pageHeight),
    },);
    item.canvas.width = 0;
    item.canvas.height = 0;
  }
  return pages;
}

document.getElementById('pdf').addEventListener('click', async () => {
  if (!guide) return;
  await rememberVisibleTitle();
  const button = document.getElementById('pdf');
  button.disabled = true;
  button.textContent = '正在生成';
  try {
    const pages = await renderPdfPages(guide, readPdfStyle());
    const bytes = buildPdf(pages);
    downloadBlob(safeFileName(guide.title) + '.pdf', new Blob([bytes], { type: 'application/pdf' }));
  } catch (error) {
    document.getElementById('status').textContent = 'PDF 没有生成。' + (error && error.message ? error.message : '');
  } finally {
    button.disabled = false;
    button.textContent = '下载 PDF';
  }
},);

document.getElementById('html').addEventListener('click', async () => {
  if (!guide) return;
  await rememberVisibleTitle();
  const name = (guide.title || 'sop').replace(/[\\/:*?"<>|]/g, '-') + '.html';
  downloadText(name, toHtml(guide, readPdfStyle()), 'text/html');
},);

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  },);
}

function videoMime() {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  let mime = '';
  candidates.forEach((item) => {
    if (!mime && MediaRecorder.isTypeSupported(item)) mime = item;
  },);
  return mime;
}

function videoPx(width, value) {
  return Math.max(1, Math.round((value * width) / 1280));
}

function drawFullShot(ctx, image, destX, destY, destW, destH) {
  const scale = Math.min(destW / image.width, destH / image.height);
  const drawWidth = Math.max(1, Math.round(image.width * scale));
  const drawHeight = Math.max(1, Math.round(image.height * scale));
  const x = destX + Math.round((destW - drawWidth) / 2);
  const y = destY + Math.round((destH - drawHeight) / 2);
  ctx.drawImage(image, 0, 0, image.width, image.height, x, y, drawWidth, drawHeight);
  return { x, y, drawWidth, drawHeight };
}

function paintVideoSlide(ctx, slide) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const pad = videoPx(width, 56);
  const font = 'PingFang SC, Noto Sans SC, sans-serif';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#f3f1fb';
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'top';
  let y = pad;
  if (slide.headline) {
    ctx.font = '600 ' + videoPx(width, 52) + 'px ' + font;
    ctx.fillStyle = '#241b4a';
    wrapPdfText(ctx, slide.headline, width - pad * 2).slice(0, 2).forEach((line) => {
      ctx.fillText(line, pad, y);
      y += videoPx(width, 64);
    },);
    y += videoPx(width, 16);
  }
  const split = Boolean(slide.image && slide.label);
  const gap = videoPx(width, 40);
  const textWidth = split ? Math.round((width - pad * 2 - gap) * 0.32) : width - pad * 2;
  const contentTop = y;
  if (slide.label) {
    ctx.font = '600 ' + videoPx(width, 32) + 'px ' + font;
    ctx.fillStyle = '#5b46f5';
    ctx.fillText(slide.label, pad, y);
    const numberWidth = ctx.measureText(slide.label + '  ').width;
    ctx.fillStyle = '#241b4a';
    const titleWidth = Math.max(videoPx(width, 80), textWidth - numberWidth);
    const titleLines = wrapPdfText(ctx, slide.title, titleWidth);
    const shown = titleLines.length ? titleLines.slice(0, 4) : [''];
    shown.forEach((line, lineIndex) => {
      const x = lineIndex === 0 ? pad + numberWidth : pad;
      ctx.fillText(line, x, y);
      y += videoPx(width, 42);
    },);
    y += videoPx(width, 12);
  }
  if (slide.body) {
    ctx.font = videoPx(width, 28) + 'px ' + font;
    ctx.fillStyle = '#241b4a';
    const maxLines = split ? 12 : 8;
    wrapPdfText(ctx, slide.body, textWidth).slice(0, maxLines).forEach((line) => {
      ctx.fillText(line, pad, y);
      y += videoPx(width, 38);
    },);
  }
  if (slide.image) {
    const imageX = split ? pad + textWidth + gap : pad;
    const imageWidth = width - pad - imageX;
    const room = height - pad - contentTop;
    if (room > videoPx(width, 40)) {
      drawFullShot(ctx, slide.image, imageX, contentTop, imageWidth, room);
    }
    return;
  }
  if (slide.label) {
    ctx.fillStyle = '#5b46f5';
    ctx.font = videoPx(width, 24) + 'px ' + font;
    ctx.fillText('这一步没有截到画面。', pad, y + videoPx(width, 12));
  }
}

async function buildStepVideo(guide, onProgress) {
  const steps = guide.steps || [];
  const rawTitle = displayTitle(guide);
  const headline = rawTitle && rawTitle !== '未命名流程' ? rawTitle : '';
  const slides = [{
    headline,
    label: '',
    title: '',
    body: guide.description || '',
    image: null,
    ms: 2800,
  },];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const image = await loadPdfImage(step.image);
    const extra = Math.min(2200, Math.round(String(step.note || '').length * 35));
    slides.push({
      headline,
      label: String(index + 1),
      title: step.text || '',
      body: step.note || '',
      image,
      focusX: step.xPct,
      focusY: step.yPct,
      ms: 2600 + extra,
    },);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  canvas.hidden = true;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  try {
    if (typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      throw new Error('无法生成视频');
    }
    const stream = canvas.captureStream(30);
    const mime = videoMime();
    const options = { videoBitsPerSecond: 20000000 };
    if (mime) options.mimeType = mime;
    const recorder = new MediaRecorder(stream, options);
    const chunks = [];
    const done = new Promise((resolve, reject) => {
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      },);
      recorder.addEventListener('stop', () => {
        stream.getTracks().forEach((track) => {
          track.stop();
        },);
        resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
      },);
      recorder.addEventListener('error', () => {
        reject(new Error('视频没有生成'));
      },);
    },);
    recorder.start(200);
    for (let index = 0; index < slides.length; index += 1) {
      if (onProgress) onProgress('正在按步骤生成视频 ' + (index + 1) + ' / ' + slides.length);
      paintVideoSlide(ctx, slides[index]);
      await sleep(slides[index].ms);
    }
    recorder.stop();
    return await done;
  } finally {
    canvas.remove();
  }
}

document.getElementById('video').addEventListener('click', async () => {
  if (!guide || !guide.steps || !guide.steps.length) {
    document.getElementById('status').textContent = '还没有步骤。先把操作录成步骤，再生成视频。';
    return;
  }
  await rememberVisibleTitle();
  const button = document.getElementById('video');
  button.disabled = true;
  button.textContent = '正在生成';
  try {
    const blob = await buildStepVideo(guide, (text) => {
      document.getElementById('status').textContent = text;
    },);
    downloadBlob(fileStem(displayTitle(guide), '未命名流程', 80) + '.webm', blob);
    document.getElementById('status').textContent = '视频已按当前步骤生成。改完步骤可以再下载一次。';
  } catch (error) {
    document.getElementById('status').textContent = '视频没有生成。';
  } finally {
    button.disabled = false;
    button.textContent = '下载视频';
  }
},);

document.getElementById('preview').addEventListener('click', async () => {
  await rememberVisibleTitle();
  chrome.tabs.create({ url: chrome.runtime.getURL('guide.html') });
},);

let previewPages = [];
let previewUrls = [];
let previewIndex = 0;

function revokePreview() {
  previewUrls.forEach((url) => {
    URL.revokeObjectURL(url);
  },);
  previewUrls = [];
  previewPages = [];
}

function showPreviewPage() {
  const total = previewUrls.length;
  const img = document.getElementById('pdf-preview-image');
  img.src = previewUrls[previewIndex] || '';
  document.getElementById('pdf-preview-index').textContent = (previewIndex + 1) + ' / ' + total;
  document.getElementById('pdf-preview-prev').disabled = previewIndex <= 0;
  document.getElementById('pdf-preview-next').disabled = previewIndex >= total - 1;
}

function closePdfPreview() {
  revokePreview();
  document.getElementById('pdf-preview').hidden = true;
  document.getElementById('pdf-preview-image').removeAttribute('src');
}

async function openPdfPreview() {
  if (!guide) return;
  await rememberVisibleTitle();
  const button = document.getElementById('pdf-preview-open');
  button.disabled = true;
  button.textContent = '正在生成';
  try {
    revokePreview();
    const pages = await renderPdfPages(guide, readPdfStyle());
    previewPages = pages;
    previewUrls = pages.map((page) => {
      return URL.createObjectURL(page.preview);
    },);
    previewIndex = 0;
    showPreviewPage();
    document.getElementById('pdf-preview').hidden = false;
  } catch (error) {
    const detail = error && error.message ? error.message : '';
    document.getElementById('status').textContent = 'PDF 预览没有生成。' + detail;
  } finally {
    button.disabled = false;
    button.textContent = 'PDF 预览';
  }
}

document.getElementById('pdf-preview-open').addEventListener('click', () => {
  openPdfPreview();
},);
document.getElementById('pdf-preview-prev').addEventListener('click', () => {
  if (previewIndex <= 0) return;
  previewIndex -= 1;
  showPreviewPage();
},);
document.getElementById('pdf-preview-next').addEventListener('click', () => {
  if (previewIndex >= previewUrls.length - 1) return;
  previewIndex += 1;
  showPreviewPage();
},);
document.getElementById('pdf-preview-close').addEventListener('click', closePdfPreview);
document.getElementById('pdf-preview-download').addEventListener('click', () => {
  if (!guide || !previewPages.length) return;
  const bytes = buildPdf(previewPages);
  const file = new Blob([bytes], { type: 'application/pdf' });
  downloadBlob(safeFileName(guide.title) + '.pdf', file);
},);

let shotSeen = 0;

function showSavedShot(next) {
  if (!next || (next.shotRev || 0) < shotSeen) return;
  shotSeen = next.shotRev || shotSeen;
  guide = next;
  render();
  document.getElementById('status').textContent = '这张截图的马赛克已保存。';
}

function reloadSavedShot() {
  return loadGuide().then(showSavedShot);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.shotEditSaved) return;
  reloadSavedShot().catch(() => {
    /* 忽略失败 */
  });
},);

const shotChannel = new BroadcastChannel('sop-guide');
shotChannel.onmessage = (event) => {
  const data = event.data || {};
  if (data.type === 'shot-saved') {
    reloadSavedShot().then(() => {
      shotChannel.postMessage({ type: 'shot-applied', id: data.id });
    },).catch(() => {
      /* 忽略失败 */
    });
  }
};

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'GUIDE') {
    if (!message.guide || (message.guide.shotRev || 0) < shotSeen) return;
    shotSeen = message.guide.shotRev || shotSeen;
    guide = message.guide;
    render();
  }
  if (message.type === 'GUIDE_REFRESH' || message.type === 'RELOAD_GUIDE' || message.type === 'SHOT_SAVED') {
    reloadSavedShot().catch(() => {
      /* 忽略失败 */
    });
  }
  if (message.type === 'LIMIT') {
    document.getElementById('status').textContent = '已到 ' + message.max + ' 步上限。先删除不需要的步骤再继续。';
  }
},);

function pageTitleOf(tab) {
  if (!tab || !tab.url || !/^https?:/i.test(tab.url)) return '';
  return String(tab.title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

async function fillSopTitle() {
  let pageTitle = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    pageTitle = pageTitleOf(tab);
  } catch (error) {
    pageTitle = '';
  }
  if (!pageTitle || !guide) return;
  if (String(guide.customTitle || '').trim()) return;
  if (guide.steps && guide.steps.length && guide.pageTitle) return;
  const input = document.getElementById('title');
  if (input && document.activeElement !== input) input.value = pageTitle;
  const response = await ask({ type: 'SET_PAGE_TITLE', title: pageTitle });
  if (response && response.guide) {
    guide = response.guide;
    render();
  }
}

ask({ type: 'GET_STATE' }).then((response) => {
  guide = response && response.guide;
  render();
  fillSopTitle();
},);

chrome.tabs.onActivated.addListener(() => {
  fillSopTitle();
},);
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.title) fillSopTitle();
},);

document.getElementById('pdf-steps').addEventListener('input', () => {
  setStepsPerPage(document.getElementById('pdf-steps').value);
  savePdfStyle();
},);
document.getElementById('pdf-style').addEventListener('change', savePdfStyle);
document.getElementById('pdf-style').addEventListener('input', (event) => {
  const target = event.target;
  if (target.id === 'pdf-image') setImagePercent(target.value);
  if (target.id === 'pdf-title-size') {
    setRange('pdf-title-size', 'pdf-title-size-label', target.value, 14, 40, PDF_DEFAULT.titleSize, '');
  }
  if (target.id === 'pdf-step-size') {
    setRange('pdf-step-size', 'pdf-step-size-label', target.value, 14, 40, PDF_DEFAULT.stepSize, '');
  }
  if (target.id === 'pdf-note-size') {
    setRange('pdf-note-size', 'pdf-note-size-label', target.value, 12, 32, PDF_DEFAULT.noteSize, '');
  }
  if (target.id === 'pdf-block-gap') {
    setRange('pdf-block-gap', 'pdf-block-gap-label', target.value, 0, 48, PDF_DEFAULT.blockGap, '');
  }
  if (target.id === 'pdf-line-gap') {
    setRange('pdf-line-gap', 'pdf-line-gap-label', target.value, 0, 32, PDF_DEFAULT.lineGap, '');
  }
  if (target.id === 'pdf-logo-size') {
    setRange('pdf-logo-size', 'pdf-logo-size-label', target.value, 8, 40, PDF_DEFAULT.logoSize, '%');
  }
  if (target.id === 'pdf-watermark-size') {
    setRange(
      'pdf-watermark-size',
      'pdf-watermark-size-label',
      target.value,
      16,
      70,
      PDF_DEFAULT.watermarkSize,
      '%',
    );
  }
  if (target.id === 'pdf-watermark-opacity') {
    setRange(
      'pdf-watermark-opacity',
      'pdf-watermark-opacity-label',
      target.value,
      8,
      70,
      PDF_DEFAULT.watermarkOpacity,
      '%',
    );
  }
  savePdfStyle();
},);
document.getElementById('pdf-logo-file').addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    pdfMarkData.logo = await readMarkFile(file);
    pdfMarkData.logoMode = 'custom';
    paintMarkState();
    savePdfStyle();
  } catch (error) {
    document.getElementById('status').textContent = '商标没有读出来。请换一张 8MB 以内的 PNG、JPG 或 SVG。';
  }
},);
document.getElementById('pdf-watermark-file').addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    pdfMarkData.watermark = await readMarkFile(file);
    paintMarkState();
    savePdfStyle();
  } catch (error) {
    document.getElementById('status').textContent = '水印没有读出来。请换一张 8MB 以内的图片。';
  }
},);
document.getElementById('pdf-logo-clear').addEventListener('click', () => {
  pdfMarkData.logo = '';
  pdfMarkData.logoMode = 'none';
  document.getElementById('pdf-logo-file').value = '';
  paintMarkState();
  savePdfStyle();
},);
document.getElementById('pdf-watermark-clear').addEventListener('click', () => {
  pdfMarkData.watermark = '';
  document.getElementById('pdf-watermark-file').value = '';
  paintMarkState();
  savePdfStyle();
},);
document.getElementById('pdf-reset').addEventListener('click', () => {
  applyPdfStyle(PDF_DEFAULT);
  savePdfStyle();
},);
document.getElementById('panel-style').addEventListener('input', (event) => {
  const target = event.target;
  if (target.id === 'panel-theme') {
    const theme = PANEL_THEMES[target.value] || PANEL_THEMES.paper;
    document.getElementById('panel-paper').value = theme.paper;
    document.getElementById('panel-ink').value = theme.ink;
    document.getElementById('panel-accent').value = theme.accent;
    document.getElementById('panel-title-color').value = theme.ink;
    document.getElementById('panel-step-title-color').value = theme.ink;
    document.getElementById('panel-note-color').value = theme.ink;
  }
  if (target.id === 'panel-font') {
    setRange('panel-font', 'panel-font-label', target.value, 12, 20, PANEL_DEFAULT.fontSize, '');
  }
  if (target.id === 'panel-space') {
    setRange('panel-space', 'panel-space-label', target.value, 8, 28, PANEL_DEFAULT.spacing, '');
  }
  if (target.id === 'panel-leading') setLeading(target.value);
  if (target.id === 'panel-radius') {
    setRange('panel-radius', 'panel-radius-label', target.value, 0, 16, PANEL_DEFAULT.radius, '');
  }
  if (target.id === 'panel-opacity') setTransparency(target.value);
  if (target.id === 'panel-title-size') {
    setRange('panel-title-size', 'panel-title-size-label', target.value, 14, 36, PANEL_DEFAULT.titleSize, '');
  }
  if (target.id === 'panel-step-title-size') {
    setRange(
      'panel-step-title-size',
      'panel-step-title-size-label',
      target.value,
      14,
      36,
      PANEL_DEFAULT.stepTitleSize,
      '',
    );
  }
  if (target.id === 'panel-note-size') {
    setRange('panel-note-size', 'panel-note-size-label', target.value, 12, 28, PANEL_DEFAULT.noteSize, '');
  }
  paintPanel(readPanelStyle());
  savePanelStyle();
},);
document.getElementById('panel-style').addEventListener('change', (event) => {
  if (event.target.id !== 'panel-theme') return;
  const theme = PANEL_THEMES[event.target.value] || PANEL_THEMES.paper;
  document.getElementById('panel-paper').value = theme.paper;
  document.getElementById('panel-ink').value = theme.ink;
  document.getElementById('panel-accent').value = theme.accent;
  document.getElementById('panel-title-color').value = theme.ink;
  document.getElementById('panel-note-color').value = theme.ink;
  paintPanel(readPanelStyle());
  savePanelStyle();
},);
document.getElementById('panel-reset').addEventListener('click', () => {
  applyPanelStyle(PANEL_DEFAULT);
  savePanelStyle();
},);
chrome.storage.local.get(['pdfStyle', 'panelStyle'], (data) => {
  applyPdfStyle(data && data.pdfStyle);
  applyPanelStyle(data && data.panelStyle);
},);
