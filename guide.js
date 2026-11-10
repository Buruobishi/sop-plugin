function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function logoAlign(position) {
  const name = String(position || '');
  if (!name) return '';
  if (name.indexOf('left') >= 0) return 'left';
  if (name.indexOf('right') >= 0) return 'right';
  return 'center';
}

function logoMarkup(style) {
  const src = style && typeof style.logo === 'string' ? style.logo : '';
  if (!src || src.indexOf('data:image/') !== 0 || (style && style.logoMode === 'none')) return '';
  const align = logoAlign(style.logoPosition) || 'right';
  return '<header class="brand brand-' + align + '"><img alt="商标" src="' + src + '"></header>';
}

function readPdfStyle() {
  return new Promise((resolve) => {
    if (!chrome.storage || !chrome.storage.local) {
      resolve(null);
      return;
    }
    chrome.storage.local.get('pdfStyle', (data) => {
      resolve(data && data.pdfStyle);
    },);
  },);
}

loadGuide().then(async (guide) => {
  const style = await readPdfStyle();
  const doc = document.getElementById('doc');
  const when = guide.startedAt
    ? '<p class="when">录制时间：' + escapeHtml(new Date(guide.startedAt).toLocaleString('zh-CN')) + '</p>'
    : '';
  const steps = (guide.steps || [])
    .map((step, index) => {
      const shot = step.image
        ? '<div class="shot"><img alt="步骤截图，橙色圆点是点击位置" src="' + step.image + '"></div>'
        : '<p class="url">这一步没有截到画面。</p>';
      const note = step.note ? '<p class="note">' + escapeHtml(step.note) + '</p>' : '';
      return '<article class="step"><div class="copy"><h2><span>'
        + (index + 1)
        + '</span>'
        + escapeHtml(step.text)
        + '</h2>'
        + note
        + '</div>'
        + shot
        + '</article>';
    },)
    .join('');
  document.title = guide.title || 'SOP 预览';
  doc.innerHTML =
    logoMarkup(style) +
    '<h1>' +
    escapeHtml(guide.title || '未命名流程') +
    '</h1>' +
    (guide.description
      ? '<p class="lead">' + escapeHtml(guide.description).replace(/\n/g, '<br>') + '</p>'
      : '') +
    when +
    (steps || '<p>还没有步骤。</p>');
},);
