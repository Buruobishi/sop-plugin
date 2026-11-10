function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fileStem(name, fallback) {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || fallback).slice(0, 40);
}

function safeFileName(name) {
  return fileStem(name, 'sop');
}

function stepImageName(guide, step, index, used) {
  const title = fileStem(guide.title, '未命名流程');
  const stepTitle = fileStem(step.text, '步骤' + (index + 1));
  let stem = title + '+' + stepTitle;
  let name = stem + '.jpg';
  if (used[name]) name = stem + '+' + (index + 1) + '.jpg';
  used[name] = true;
  return 'images/' + name;
}

function dataUrlToBytes(dataUrl) {
  const comma = String(dataUrl || '').indexOf(',');
  const binary = atob(String(dataUrl || '').slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i) & 255;
  return bytes;
}

function markdownPackage(guide) {
  const base = fileStem(guide.title, '未命名流程');
  const lines = ['# ' + (guide.title || '未命名流程'), ''];
  const files = [];
  const usedNames = {};
  if (guide.description) lines.push(guide.description, '');
  if (guide.startedAt) {
    lines.push('录制时间：' + new Date(guide.startedAt).toLocaleString('zh-CN'), '');
  }
  (guide.steps || []).forEach((step, index) => {
    lines.push('## ' + (index + 1) + '. ' + step.text, '');
    if (step.note) lines.push(step.note, '');
    if (step.url) lines.push('页面：' + step.url, '');
    if (step.image) {
      const imageName = stepImageName(guide, step, index, usedNames);
      const alt = String(step.text || '步骤' + (index + 1)).replace(/[\[\]]/g, '');
      lines.push('![' + alt + '](<' + imageName + '>)', '');
      files.push({ name: imageName, bytes: dataUrlToBytes(step.image) });
    }
  },);
  const markdown = lines.join('\n');
  files.unshift({ name: base + '.md', bytes: new TextEncoder().encode(markdown) });
  return { filename: base + '.zip', markdown, files };
}

function u16(value) {
  return Uint8Array.of(value & 255, (value >>> 8) & 255);
}

function u32(value) {
  return Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
}

function concatBytes(parts) {
  let length = 0;
  parts.forEach((part) => {
    length += part.length;
  },);
  const out = new Uint8Array(length);
  let cursor = 0;
  parts.forEach((part) => {
    out.set(part, cursor);
    cursor += part.length;
  },);
  return out;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
}

function zipStore(entries) {
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  entries.forEach((entry) => {
    const name = encoder.encode(entry.name);
    const data = entry.bytes;
    const crc = crc32(data);
    const local = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ],);
    locals.push(local);
    centrals.push(concatBytes([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ],),);
    offset += local.length;
  },);
  const centralDir = concatBytes(centrals);
  const end = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ],);
  return concatBytes(locals.concat([centralDir, end]));
}

function toPlainText(guide) {
  const lines = ['# ' + (guide.title || '未命名流程'), ''];
  if (guide.description) lines.push(guide.description, '');
  guide.steps.forEach((step, index) => {
    lines.push((index + 1) + '. ' + step.text);
    if (step.note) lines.push('   ' + step.note);
    if (step.url) lines.push('   页面：' + step.url);
  },);
  return lines.join('\n');
}

function toHtml(guide) {
  const steps = guide.steps
    .map((step, index) => {
      const shot = step.image
        ? '<div class="shot"><img alt="步骤截图，橙色圆点是点击位置" src="' + step.image + '"></div>'
        : "<p class='url'>这一步没有截到画面。</p>";
      const note = step.note ? "<p class='note'>" + escapeHtml(step.note) + '</p>' : '';
      const url = step.url ? '<p class="url">' + escapeHtml(step.url) + '</p>' : '';
      return (
        '<article class="step"><h2><span>' +
        (index + 1) +
        '</span>' +
        escapeHtml(step.text) +
        '</h2>' +
        note +
        url +
        shot +
        '</article>'
      );
    },)
    .join('');
  const when = guide.startedAt
    ? "<p class='when'>录制时间：" + escapeHtml(new Date(guide.startedAt).toLocaleString('zh-CN')) + '</p>'
    : '';
  return (
    "<!DOCTYPE html><html lang='zh-CN'><head><meta charset='utf-8'><title>" +
    escapeHtml(guide.title || 'SOP') +
    '</title><style>' +
    "body{margin:0;background:#f4f1ea;color:#1c1915;font:16px/1.55 'Songti SC','Iowan Old Style',Palatino,serif}" +
    'main{max-width:880px;margin:0 auto;padding:40px 24px 80px}' +
    'h1{font-size:32px;font-weight:600;letter-spacing:-.02em;margin:0 0 8px}' +
    '.when{margin:0 0 28px;color:#6d655b}' +
    '.step{margin:0 0 36px}' +
    ".step h2{font:600 20px/1.4 'Songti SC',Palatino,serif;margin:0 0 8px}" +
    '.step h2 span{display:inline-block;min-width:1.6em;margin-right:8px;color:#c2410c}' +
    ".note{margin:0 0 10px;font:16px/1.55 'PingFang SC',sans-serif}" +
    ".lead{margin:0 0 28px;font:17px/1.6 'PingFang SC',sans-serif}" +
    '.url{margin:0 0 10px;color:#6d655b;font:13px/1.4 ui-sans-serif,sans-serif;word-break:break-all}' +
    '.shot{position:relative;border:1px solid #e4dccf;border-radius:10px;overflow:hidden;background:#fff}' +
    '.shot img{display:block;width:100%;height:auto}' +
    '</style></head><body><main><h1>' +
    escapeHtml(guide.title || '未命名流程') +
    '</h1>' +
    (guide.description ? "<p class='lead'>" + escapeHtml(guide.description) + '</p>' : '') +
    when +
    steps +
    '</main></body></html>'
  );
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadText(filename, content, type) {
  downloadBlob(filename, new Blob([content], { type }));
}

function downloadMarkdown(guide) {
  const pack = markdownPackage(guide);
  downloadBlob(pack.filename, new Blob([zipStore(pack.files)], { type: 'application/zip' }));
}

function buildPdf(pages) {
  const encoder = new TextEncoder();
  function enc(value) {
    return encoder.encode(value);
  }
  const parts = [];
  let pos = 0;
  function add(bytes) {
    parts.push(bytes);
    pos += bytes.length;
  }
  const offsets = [0];
  function addObj(id, chunks) {
    offsets[id] = pos;
    chunks.forEach(add);
  }
  add(enc('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n'));
  const kids = [];
  const plans = pages.map((page, index) => {
    const imageId = 3 + index * 3;
    kids.push(imageId + 2 + ' 0 R');
    return { page, imageId, contentId: imageId + 1, pageId: imageId + 2 };
  },);
  addObj(1, [enc('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')]);
  addObj(2, [enc('2 0 obj\n<< /Type /Pages /Count ' + pages.length + ' /Kids [' + kids.join(' ') + '] >>\nendobj\n')]);
  plans.forEach((plan) => {
    const jpeg = plan.page.bytes;
    const pageWidth = plan.page.pageWidth;
    const pageHeight = plan.page.pageHeight;
    addObj(plan.imageId, [
      enc(
        plan.imageId +
          ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' +
          plan.page.width +
          ' /Height ' +
          plan.page.height +
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
          jpeg.length +
          ' >>\nstream\n',
      ),
      jpeg,
      enc('\nendstream\nendobj\n'),
    ],);
    const content = 'q\n' + pageWidth + ' 0 0 ' + pageHeight + ' 0 0 cm\n/Im' + plan.imageId + ' Do\nQ\n';
    const contentBytes = enc(content);
    addObj(plan.contentId, [
      enc(plan.contentId + ' 0 obj\n<< /Length ' + contentBytes.length + ' >>\nstream\n'),
      contentBytes,
      enc('endstream\nendobj\n'),
    ],);
    addObj(plan.pageId, [
      enc(
        plan.pageId +
          ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
          pageWidth +
          ' ' +
          pageHeight +
          '] /Contents ' +
          plan.contentId +
          ' 0 R /Resources << /XObject << /Im' +
          plan.imageId +
          ' ' +
          plan.imageId +
          ' 0 R >> >> >>\nendobj\n',
      ),
    ],);
  },);
  const size = 3 + pages.length * 3;
  let xref = 'xref\n0 ' + size + '\n0000000000 65535 f \n';
  for (let id = 1; id < size; id += 1) {
    xref += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
  }
  const xrefPos = pos;
  add(enc(xref));
  add(enc('trailer\n<< /Size ' + size + ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n'));
  return concatBytes(parts);
}
