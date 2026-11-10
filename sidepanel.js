let guide = null;

function ask(message) {
  return chrome.runtime.sendMessage(message);
}

function render() {
  const title = document.getElementById("title");
  const description = document.getElementById("description");
  const toggle = document.getElementById("toggle");
  const status = document.getElementById("status");
  const list = document.getElementById("steps");
  if (!guide) return;
  if (document.activeElement !== title) title.value = guide.title || "";
  if (document.activeElement !== description) description.value = guide.description || "";
  toggle.textContent = guide.recording ? "完成录制" : "开始录制";
  toggle.classList.toggle("live", Boolean(guide.recording));
  status.textContent = guide.recording
    ? "正在录制，已记 " + guide.steps.length + " 步。快捷键 Command+Shift+Y 可结束。密码框只记「输入密码」。"
    : "已记 " + guide.steps.length + " 步。点开始后，去网页上把流程走一遍。";
  if (!guide.steps.length) {
    list.innerHTML = "<p class='empty'>还没有步骤。</p>";
    return;
  }
  list.innerHTML = "";
  guide.steps.forEach(function (step, index) {
    const item = document.createElement("li");
    item.className = "step";
    const num = document.createElement("div");
    num.className = "num";
    num.textContent = String(index + 1);
    const body = document.createElement("div");
    const titleField = document.createElement("label");
    titleField.className = "field";
    titleField.textContent = "标题";
    const text = document.createElement("textarea");
    text.className = "step-title";
    text.value = step.text || "";
    text.addEventListener("change", function () {
      ask({ type: "UPDATE_STEP", id: step.id, text: text.value });
    });
    const noteField = document.createElement("label");
    noteField.className = "field";
    noteField.textContent = "说明";
    const note = document.createElement("textarea");
    note.className = "step-note";
    note.placeholder = "这一步要确认什么、做错了会怎样";
    note.value = step.note || "";
    note.addEventListener("change", function () {
      ask({ type: "UPDATE_STEP", id: step.id, note: note.value });
    });
    body.appendChild(titleField);
    body.appendChild(text);
    body.appendChild(noteField);
    body.appendChild(note);
    if (step.url) {
      const url = document.createElement("p");
      url.className = "url";
      url.textContent = step.url;
      body.appendChild(url);
    }
    const shot = document.createElement("div");
    shot.className = "shot";
    if (step.image) {
      const img = document.createElement("img");
      img.src = step.image;
      img.alt = "步骤截图，橙色圆点是点击位置";
      shot.appendChild(img);
    } else {
      const missing = document.createElement("p");
      missing.className = "missing";
      missing.textContent = step.shotError || "这一步没有截到画面。";
      shot.appendChild(missing);
    }
    body.appendChild(shot);
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.appendChild(action("上移", function () {
      ask({ type: "MOVE_STEP", id: step.id, delta: -1 });
    }));
    actions.appendChild(action("下移", function () {
      ask({ type: "MOVE_STEP", id: step.id, delta: 1 });
    }));
    actions.appendChild(action("删除", function () {
      ask({ type: "DELETE_STEP", id: step.id });
    }));
    if (step.kind === "type" && !step.sensitive) {
      actions.appendChild(action("涂掉输入", function () {
        ask({ type: "REDACT_STEP", id: step.id });
      }));
    }
    body.appendChild(actions);
    item.appendChild(num);
    item.appendChild(body);
    list.appendChild(item);
  });
}

function action(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

document.getElementById("toggle").addEventListener("click", async function () {
  const response = await ask({ type: "SET_RECORDING", on: !(guide && guide.recording) });
  if (response && response.guide) {
    guide = response.guide;
    render();
  }
});

document.getElementById("title").addEventListener("change", function (event) {
  ask({ type: "UPDATE_TITLE", title: event.target.value });
});

document.getElementById("description").addEventListener("change", function (event) {
  ask({ type: "UPDATE_DESCRIPTION", description: event.target.value });
});

document.getElementById("note").addEventListener("click", function () {
  const text = window.prompt("补充说明", "注意：");
  if (text) ask({ type: "ADD_NOTE", text: text });
});

document.getElementById("clear").addEventListener("click", async function () {
  if (!window.confirm("清空当前全部步骤？")) return;
  const response = await ask({ type: "CLEAR" });
  if (response && response.guide) {
    guide = response.guide;
    render();
  }
});

document.getElementById("copy").addEventListener("click", async function () {
  if (!guide) return;
  await navigator.clipboard.writeText(toPlainText(guide));
  const button = document.getElementById("copy");
  button.textContent = "已复制";
  setTimeout(function () {
    button.textContent = "复制文字";
  }, 1200);
});

document.getElementById("markdown").addEventListener("click", function () {
  if (!guide) return;
  downloadMarkdown(guide);
});

function wrapPdfText(ctx, text, maxWidth) {
  const chars = Array.from(String(text || ""));
  const lines = [];
  let line = "";
  chars.forEach(function (ch) {
    const next = line + ch;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = ch;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function loadPdfImage(src) {
  return new Promise(function (resolve) {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = function () {
      resolve(img);
    };
    img.onerror = function () {
      resolve(null);
    };
    img.src = src;
  });
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
  paper: "#f7f4ee",
  ink: "#1c1915",
  muted: "#6d655b",
  accent: "#c2410c",
  page: "a4",
  orientation: "portrait",
  size: "m",
  margin: "m",
  image: 100,
  titleColor: "#1c1915",
  titleSize: 22,
  stepSize: 28,
  titleBold: true,
  noteColor: "#1c1915",
  noteSize: 18,
  noteBold: false,
  blockGap: 12,
  lineGap: 8,
  showUrl: true,
  showLabels: true,
};

function hexColor(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(value || "") ? value : fallback;
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

function setImagePercent(value) {
  const percent = imagePercent(value);
  document.getElementById("pdf-image").value = String(percent);
  document.getElementById("pdf-image-label").textContent = percent + "%";
}

function readPdfStyle() {
  return {
    paper: hexColor(document.getElementById("pdf-paper").value, PDF_DEFAULT.paper),
    ink: hexColor(document.getElementById("pdf-ink").value, PDF_DEFAULT.ink),
    muted: hexColor(document.getElementById("pdf-muted").value, PDF_DEFAULT.muted),
    accent: hexColor(document.getElementById("pdf-accent").value, PDF_DEFAULT.accent),
    page: PDF_PAPER[document.getElementById("pdf-page").value] ? document.getElementById("pdf-page").value : "a4",
    orientation: document.getElementById("pdf-orientation").value === "landscape" ? "landscape" : "portrait",
    size: document.getElementById("pdf-size").value || "m",
    margin: document.getElementById("pdf-margin").value || "m",
    image: imagePercent(document.getElementById("pdf-image").value),
    titleColor: hexColor(document.getElementById("pdf-title-color").value, PDF_DEFAULT.titleColor),
    titleSize: clampInt(document.getElementById("pdf-title-size").value, 14, 40, PDF_DEFAULT.titleSize),
    stepSize: clampInt(document.getElementById("pdf-step-size").value, 14, 40, PDF_DEFAULT.stepSize),
    titleBold: document.getElementById("pdf-title-bold").checked,
    noteColor: hexColor(document.getElementById("pdf-note-color").value, PDF_DEFAULT.noteColor),
    noteSize: clampInt(document.getElementById("pdf-note-size").value, 12, 32, PDF_DEFAULT.noteSize),
    noteBold: document.getElementById("pdf-note-bold").checked,
    blockGap: clampInt(document.getElementById("pdf-block-gap").value, 0, 48, PDF_DEFAULT.blockGap),
    lineGap: clampInt(document.getElementById("pdf-line-gap").value, 0, 32, PDF_DEFAULT.lineGap),
    showUrl: document.getElementById("pdf-url").checked,
    showLabels: document.getElementById("pdf-labels").checked,
  };
}

function applyPdfStyle(style) {
  const next = Object.assign({}, PDF_DEFAULT, style || {});
  document.getElementById("pdf-paper").value = hexColor(next.paper, PDF_DEFAULT.paper);
  document.getElementById("pdf-ink").value = hexColor(next.ink, PDF_DEFAULT.ink);
  document.getElementById("pdf-muted").value = hexColor(next.muted, PDF_DEFAULT.muted);
  document.getElementById("pdf-accent").value = hexColor(next.accent, PDF_DEFAULT.accent);
  document.getElementById("pdf-page").value = PDF_PAPER[next.page] ? next.page : "a4";
  document.getElementById("pdf-orientation").value = next.orientation === "landscape" ? "landscape" : "portrait";
  document.getElementById("pdf-size").value = next.size === "s" || next.size === "l" ? next.size : "m";
  document.getElementById("pdf-margin").value = next.margin === "s" || next.margin === "l" ? next.margin : "m";
  setImagePercent(next.image);
  document.getElementById("pdf-title-color").value = hexColor(next.titleColor, PDF_DEFAULT.titleColor);
  setRange("pdf-title-size", "pdf-title-size-label", next.titleSize, 14, 40, PDF_DEFAULT.titleSize, "");
  setRange("pdf-step-size", "pdf-step-size-label", next.stepSize, 14, 40, PDF_DEFAULT.stepSize, "");
  document.getElementById("pdf-title-bold").checked = next.titleBold !== false;
  document.getElementById("pdf-note-color").value = hexColor(next.noteColor, PDF_DEFAULT.noteColor);
  setRange("pdf-note-size", "pdf-note-size-label", next.noteSize, 12, 32, PDF_DEFAULT.noteSize, "");
  document.getElementById("pdf-note-bold").checked = next.noteBold === true;
  setRange("pdf-block-gap", "pdf-block-gap-label", next.blockGap, 0, 48, PDF_DEFAULT.blockGap, "");
  setRange("pdf-line-gap", "pdf-line-gap-label", next.lineGap, 0, 32, PDF_DEFAULT.lineGap, "");
  document.getElementById("pdf-url").checked = next.showUrl !== false;
  document.getElementById("pdf-labels").checked = next.showLabels !== false;
}

function savePdfStyle() {
  chrome.storage.local.set({ pdfStyle: readPdfStyle() });
}

const PANEL_THEMES = {
  paper: { paper: "#f7f4ee", ink: "#1c1915", accent: "#c2410c" },
  light: { paper: "#ffffff", ink: "#171717", accent: "#1d4ed8" },
  dark: { paper: "#1c1917", ink: "#f6f1e8", accent: "#fb923c" },
  contrast: { paper: "#ffffff", ink: "#000000", accent: "#b91c1c" },
};

const PANEL_DEFAULT = {
  theme: "paper",
  paper: "#f7f4ee",
  ink: "#1c1915",
  accent: "#c2410c",
  fontSize: 13,
  spacing: 14,
  leading: 145,
  radius: 8,
};

function hexToRgb(hex) {
  const value = hexColor(hex, "#000000").slice(1);
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function mixHex(from, to, amount) {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  return "#" + [0, 1, 2].map(function (index) {
    return Math.round(start[index] + (end[index] - start[index]) * amount).toString(16).padStart(2, "0");
  }).join("");
}

function paperLuminance(hex) {
  const channels = hexToRgb(hex).map(function (channel) {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function setLeading(value) {
  const next = clampInt(value, 120, 200, PANEL_DEFAULT.leading);
  document.getElementById("panel-leading").value = String(next);
  document.getElementById("panel-leading-label").textContent = (next / 100).toFixed(2);
  return next;
}

function readPanelStyle() {
  const theme = PANEL_THEMES[document.getElementById("panel-theme").value] ? document.getElementById("panel-theme").value : "paper";
  return {
    theme: theme,
    paper: hexColor(document.getElementById("panel-paper").value, PANEL_DEFAULT.paper),
    ink: hexColor(document.getElementById("panel-ink").value, PANEL_DEFAULT.ink),
    accent: hexColor(document.getElementById("panel-accent").value, PANEL_DEFAULT.accent),
    fontSize: clampInt(document.getElementById("panel-font").value, 12, 20, PANEL_DEFAULT.fontSize),
    spacing: clampInt(document.getElementById("panel-space").value, 8, 28, PANEL_DEFAULT.spacing),
    leading: clampInt(document.getElementById("panel-leading").value, 120, 200, PANEL_DEFAULT.leading),
    radius: clampInt(document.getElementById("panel-radius").value, 0, 16, PANEL_DEFAULT.radius),
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
  const root = document.documentElement;
  const dark = paperLuminance(paper) < 0.35;
  const classic = paper.toLowerCase() === "#f7f4ee" && ink.toLowerCase() === "#1c1915";
  root.style.colorScheme = dark ? "dark" : "light";
  root.style.setProperty("--paper", paper);
  root.style.setProperty("--ink", ink);
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--muted", classic ? "#6d655b" : mixHex(ink, paper, 0.42));
  root.style.setProperty("--line", classic ? "#e4dccf" : mixHex(ink, paper, 0.82));
  root.style.setProperty("--surface", dark ? mixHex(paper, ink, 0.12) : classic ? "#ffffff" : mixHex(paper, "#ffffff", 0.72));
  root.style.setProperty("--font-size", fontSize + "px");
  root.style.setProperty("--title-size", (fontSize + 5) + "px");
  root.style.setProperty("--line-height", (leading / 100).toFixed(2));
  root.style.setProperty("--pad-x", spacing + "px");
  root.style.setProperty("--pad-y", Math.max(8, spacing - 2) + "px");
  root.style.setProperty("--gap", Math.max(4, Math.round(spacing * 0.57)) + "px");
  root.style.setProperty("--step-gap", Math.max(6, Math.round(spacing * 0.86)) + "px");
  root.style.setProperty("--radius", radius + "px");
}

function applyPanelStyle(style) {
  const next = Object.assign({}, PANEL_DEFAULT, style || {});
  const theme = PANEL_THEMES[next.theme] ? next.theme : "paper";
  document.getElementById("panel-theme").value = theme;
  document.getElementById("panel-paper").value = hexColor(next.paper, PANEL_DEFAULT.paper);
  document.getElementById("panel-ink").value = hexColor(next.ink, PANEL_DEFAULT.ink);
  document.getElementById("panel-accent").value = hexColor(next.accent, PANEL_DEFAULT.accent);
  setRange("panel-font", "panel-font-label", next.fontSize, 12, 20, PANEL_DEFAULT.fontSize, "");
  setRange("panel-space", "panel-space-label", next.spacing, 8, 28, PANEL_DEFAULT.spacing, "");
  setLeading(next.leading);
  setRange("panel-radius", "panel-radius-label", next.radius, 0, 16, PANEL_DEFAULT.radius, "");
  paintPanel(readPanelStyle());
}

function savePanelStyle() {
  chrome.storage.local.set({ panelStyle: readPanelStyle() });
}

function paperSheet(style) {
  const pair = PDF_PAPER[style.page] || PDF_PAPER.a4;
  const longSide = Math.max(pair[0], pair[1]);
  const shortSide = Math.min(pair[0], pair[1]);
  const landscape = style.orientation === "landscape";
  const pageWidth = landscape ? longSide : shortSide;
  const pageHeight = landscape ? shortSide : longSide;
  return {
    pageWidth: pageWidth,
    pageHeight: pageHeight,
    width: Math.round((pageWidth * 96) / 72),
    height: Math.round((pageHeight * 96) / 72),
  };
}

function canvasToJpeg(canvas) {
  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (!blob) {
        reject(new Error("无法生成 PDF 页面"));
        return;
      }
      blob.arrayBuffer().then(function (buffer) {
        resolve(new Uint8Array(buffer));
      }, reject);
    }, "image/jpeg", 0.82);
  });
}

async function pushPaperPages(pages, source, sheet, paperColor) {
  const count = Math.max(1, Math.ceil(source.height / sheet.height));
  for (let index = 0; index < count; index += 1) {
    const piece = document.createElement("canvas");
    piece.width = sheet.width;
    piece.height = sheet.height;
    const ctx = piece.getContext("2d");
    ctx.fillStyle = paperColor;
    ctx.fillRect(0, 0, piece.width, piece.height);
    const offset = index * sheet.height;
    const sliceHeight = Math.min(sheet.height, source.height - offset);
    ctx.drawImage(source, 0, offset, source.width, sliceHeight, 0, 0, source.width, sliceHeight);
    pages.push({
      bytes: await canvasToJpeg(piece),
      width: piece.width,
      height: piece.height,
      pageWidth: Math.round(sheet.pageWidth),
      pageHeight: Math.round(sheet.pageHeight),
    });
  }
}

async function renderPdfPages(guide, style) {
  const sheet = paperSheet(style);
  const width = sheet.width;
  const scale = style.size === "s" ? 0.85 : style.size === "l" ? 1.22 : 1;
  const pad = Math.max(24, Math.round((style.margin === "s" ? 32 : style.margin === "l" ? 72 : 48) * (width / 794)));
  const contentWidth = width - pad * 2;
  const font = "PingFang SC, Noto Sans SC, sans-serif";
  function px(value) {
    return Math.max(12, Math.round(value * scale));
  }
  const labelSize = px(14);
  const docSize = px(style.titleSize);
  const headSize = px(style.stepSize);
  const bodySize = px(style.noteSize);
  const urlSize = px(16);
  const titleWeight = style.titleBold === false ? "400 " : "600 ";
  const noteWeight = style.noteBold ? "600 " : "400 ";
  const blockGap = Math.max(0, Math.round(clampInt(style.blockGap, 0, 48, 12) * scale));
  const lineGap = Math.max(0, Math.round(clampInt(style.lineGap, 0, 32, 8) * scale));
  const steps = guide.steps && guide.steps.length ? guide.steps : [{ text: "没有步骤", url: "", image: null }];
  const pages = [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const image = await loadPdfImage(step.image);
    const measure = document.createElement("canvas").getContext("2d");
    measure.font = noteWeight + bodySize + "px " + font;
    const intro = index === 0 && guide.description ? wrapPdfText(measure, guide.description, contentWidth) : [];
    measure.font = titleWeight + headSize + "px " + font;
    const numberWidth = measure.measureText(String(index + 1) + "  ").width;
    const headingLines = wrapPdfText(measure, step.text || "", contentWidth - numberWidth);
    measure.font = noteWeight + bodySize + "px " + font;
    const notes = step.note ? wrapPdfText(measure, step.note, contentWidth) : [];
    measure.font = urlSize + "px " + font;
    const links = style.showUrl && step.url ? wrapPdfText(measure, step.url, contentWidth) : [];
    const imageWidth = image ? Math.max(80, Math.round(contentWidth * (imagePercent(style.image) / 100))) : 0;
    const imageHeight = image ? Math.round(imageWidth * (image.height / image.width)) : 0;
    const headGap = headSize + lineGap;
    const bodyGap = bodySize + lineGap;
    const labelGap = labelSize + lineGap;
    const firstPage = index === 0;
    let height = pad;
    if (firstPage) {
      height += (style.showLabels ? labelGap : 0) + docSize + blockGap;
      if (intro.length) height += (style.showLabels ? labelGap : 0) + intro.length * bodyGap + blockGap;
    }
    height += Math.max(1, headingLines.length) * headGap;
    if (notes.length) height += (style.showLabels ? labelGap : 0) + notes.length * bodyGap;
    if (links.length) height += blockGap + links.length * (urlSize + lineGap);
    height += blockGap + (image ? imageHeight : 36) + pad;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = style.paper;
    ctx.fillRect(0, 0, width, height);
    let y = pad;
    if (firstPage) {
      if (style.showLabels) {
        ctx.fillStyle = style.muted;
        ctx.font = labelSize + "px " + font;
        ctx.fillText("标题", pad, y);
        y += labelGap;
      }
      ctx.fillStyle = style.titleColor;
      ctx.font = titleWeight + docSize + "px " + font;
      ctx.fillText(guide.title || "未命名流程", pad, y);
      y += docSize + blockGap;
      if (intro.length) {
        if (style.showLabels) {
          ctx.fillStyle = style.muted;
          ctx.font = labelSize + "px " + font;
          ctx.fillText("说明", pad, y);
          y += labelGap;
        }
        ctx.fillStyle = style.noteColor;
        ctx.font = noteWeight + bodySize + "px " + font;
        intro.forEach(function (line) {
          ctx.fillText(line, pad, y);
          y += bodyGap;
        });
        y += blockGap;
      }
    }
    ctx.fillStyle = style.accent;
    ctx.font = titleWeight + headSize + "px " + font;
    ctx.fillText(String(index + 1), pad, y);
    ctx.fillStyle = style.titleColor;
    ctx.font = titleWeight + headSize + "px " + font;
    const headingText = headingLines.length ? headingLines : [""];
    headingText.forEach(function (line, lineIndex) {
      ctx.fillText(line, pad + (lineIndex === 0 ? numberWidth : 0), y);
      y += headGap;
    });
    if (notes.length) {
      if (style.showLabels) {
        ctx.fillStyle = style.muted;
        ctx.font = labelSize + "px " + font;
        ctx.fillText("说明", pad, y);
        y += labelGap;
      }
      ctx.fillStyle = style.noteColor;
      ctx.font = noteWeight + bodySize + "px " + font;
      notes.forEach(function (line) {
        ctx.fillText(line, pad, y);
        y += bodyGap;
      });
    }
    if (links.length) {
      y += blockGap;
      ctx.fillStyle = style.muted;
      ctx.font = urlSize + "px " + font;
      links.forEach(function (line) {
        ctx.fillText(line, pad, y);
        y += urlSize + lineGap;
      });
    }
    y += blockGap;
    if (image) {
      const imageX = pad + Math.round((contentWidth - imageWidth) / 2);
      ctx.drawImage(image, imageX, y, imageWidth, imageHeight);
    } else {
      ctx.fillStyle = style.accent;
      ctx.font = urlSize + "px " + font;
      ctx.fillText(step.shotError || "这一步没有截到画面。", pad, y + 8);
    }
    await pushPaperPages(pages, canvas, sheet, style.paper);
  }
  return pages;
}

document.getElementById("pdf").addEventListener("click", async function () {
  if (!guide) return;
  const button = document.getElementById("pdf");
  button.disabled = true;
  button.textContent = "正在生成";
  try {
    const pages = await renderPdfPages(guide, readPdfStyle());
    const bytes = buildPdf(pages);
    downloadBlob(safeFileName(guide.title) + ".pdf", new Blob([bytes], { type: "application/pdf" }));
  } catch (error) {
    document.getElementById("status").textContent = "PDF 没有生成。" + (error && error.message ? error.message : "");
  } finally {
    button.disabled = false;
    button.textContent = "下载 PDF";
  }
});

document.getElementById("html").addEventListener("click", function () {
  if (!guide) return;
  const name = (guide.title || "sop").replace(/[\\/:*?"<>|]/g, "-") + ".html";
  downloadText(name, toHtml(guide), "text/html");
});

document.getElementById("preview").addEventListener("click", function () {
  chrome.tabs.create({ url: chrome.runtime.getURL("guide.html") });
});

chrome.runtime.onMessage.addListener(function (message) {
  if (message.type === "GUIDE") {
    guide = message.guide;
    render();
  }
  if (message.type === "LIMIT") {
    document.getElementById("status").textContent = "已到 " + message.max + " 步上限。先删除不需要的步骤再继续。";
  }
});

ask({ type: "GET_STATE" }).then(function (response) {
  guide = response && response.guide;
  render();
});

document.getElementById("pdf-style").addEventListener("change", savePdfStyle);
document.getElementById("pdf-style").addEventListener("input", function (event) {
  const target = event.target;
  if (target.id === "pdf-image") setImagePercent(target.value);
  if (target.id === "pdf-title-size") setRange("pdf-title-size", "pdf-title-size-label", target.value, 14, 40, PDF_DEFAULT.titleSize, "");
  if (target.id === "pdf-step-size") setRange("pdf-step-size", "pdf-step-size-label", target.value, 14, 40, PDF_DEFAULT.stepSize, "");
  if (target.id === "pdf-note-size") setRange("pdf-note-size", "pdf-note-size-label", target.value, 12, 32, PDF_DEFAULT.noteSize, "");
  if (target.id === "pdf-block-gap") setRange("pdf-block-gap", "pdf-block-gap-label", target.value, 0, 48, PDF_DEFAULT.blockGap, "");
  if (target.id === "pdf-line-gap") setRange("pdf-line-gap", "pdf-line-gap-label", target.value, 0, 32, PDF_DEFAULT.lineGap, "");
  savePdfStyle();
});
document.getElementById("pdf-reset").addEventListener("click", function () {
  applyPdfStyle(PDF_DEFAULT);
  savePdfStyle();
});
document.getElementById("panel-style").addEventListener("input", function (event) {
  const target = event.target;
  if (target.id === "panel-theme") {
    const theme = PANEL_THEMES[target.value] || PANEL_THEMES.paper;
    document.getElementById("panel-paper").value = theme.paper;
    document.getElementById("panel-ink").value = theme.ink;
    document.getElementById("panel-accent").value = theme.accent;
  }
  if (target.id === "panel-font") setRange("panel-font", "panel-font-label", target.value, 12, 20, PANEL_DEFAULT.fontSize, "");
  if (target.id === "panel-space") setRange("panel-space", "panel-space-label", target.value, 8, 28, PANEL_DEFAULT.spacing, "");
  if (target.id === "panel-leading") setLeading(target.value);
  if (target.id === "panel-radius") setRange("panel-radius", "panel-radius-label", target.value, 0, 16, PANEL_DEFAULT.radius, "");
  paintPanel(readPanelStyle());
  savePanelStyle();
});
document.getElementById("panel-style").addEventListener("change", function (event) {
  if (event.target.id !== "panel-theme") return;
  const theme = PANEL_THEMES[event.target.value] || PANEL_THEMES.paper;
  document.getElementById("panel-paper").value = theme.paper;
  document.getElementById("panel-ink").value = theme.ink;
  document.getElementById("panel-accent").value = theme.accent;
  paintPanel(readPanelStyle());
  savePanelStyle();
});
document.getElementById("panel-reset").addEventListener("click", function () {
  applyPanelStyle(PANEL_DEFAULT);
  savePanelStyle();
});
chrome.storage.local.get(["pdfStyle", "panelStyle"], function (data) {
  applyPdfStyle(data && data.pdfStyle);
  applyPanelStyle(data && data.panelStyle);
});
