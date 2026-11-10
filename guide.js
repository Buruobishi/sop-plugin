function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

loadGuide().then(function (guide) {
  const doc = document.getElementById("doc");
  const when = guide.startedAt
    ? "<p class='when'>录制时间：" + escapeHtml(new Date(guide.startedAt).toLocaleString("zh-CN")) + "</p>"
    : "";
  const steps = (guide.steps || [])
    .map(function (step, index) {
      const shot = step.image
        ? "<div class='shot'><img alt='步骤截图，橙色圆点是点击位置' src='" + step.image + "'></div>"
        : "<p class='url'>这一步没有截到画面。</p>";
      const note = step.note ? "<p class='note'>" + escapeHtml(step.note) + "</p>" : "";
      const url = step.url ? "<p class='url'>" + escapeHtml(step.url) + "</p>" : "";
      return "<article class='step'><h2><span>" + (index + 1) + "</span>" + escapeHtml(step.text) + "</h2>" + note + url + shot + "</article>";
    })
    .join("");
  document.title = guide.title || "SOP 预览";
  doc.innerHTML =
    "<h1>" +
    escapeHtml(guide.title || "未命名流程") +
    "</h1>" +
    (guide.description ? "<p class='lead'>" + escapeHtml(guide.description) + "</p>" : "") +
    when +
    (steps || "<p>还没有步骤。</p>");
});
