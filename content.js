if (!globalThis.__sopRecorderInstalled) {
  globalThis.__sopRecorderInstalled = true;

  let recording = false;
  let lastEmit = 0;
  let focused = null;

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function labelOf(el) {
    if (!el || el.nodeType !== 1) return '';
    const aria = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt');
    if (clean(aria)) return clean(aria).slice(0, 48);
    if (el.matches('input, textarea')) {
      const own = clean(el.getAttribute('placeholder') || el.getAttribute('name') || '');
      if (own) return own.slice(0, 48);
    }
    const text = clean(el.innerText || el.textContent || '');
    if (text) return text.slice(0, 48);
    if (el.id) {
      const lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lab && clean(lab.innerText)) return clean(lab.innerText).slice(0, 48);
    }
    const parent = el.closest('label');
    if (parent && clean(parent.innerText)) return clean(parent.innerText).slice(0, 48);
    return '';
  }

  function fieldLabel(el) {
    return labelOf(el) || labelOf(el.closest('label')) || clean(el.getAttribute('name')) || '';
  }

  function send(event) {
    const now = Date.now();
    if (now - lastEmit < 280 && event.kind === 'click') return;
    lastEmit = now;
    event.pageTitle = document.title;
    event.url = location.href;
    event.text = describeStep(event);
    chrome.runtime.sendMessage({ type: 'EVENT', event }).catch(() => {
      /* 忽略失败 */
    });
  }

  function percent(client, total) {
    if (!total) return null;
    const value = Math.round((client / total) * 1000) / 10;
    return Math.min(100, Math.max(0, value));
  }

  function boxOf(el) {
    if (!el || !el.getBoundingClientRect) return null;
    const rect = el.getBoundingClientRect();
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;
    if (!viewWidth || !viewHeight) return null;
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(viewWidth, rect.right);
    const bottom = Math.min(viewHeight, rect.bottom);
    if (right - left < 4 || bottom - top < 4) return null;
    return {
      x: Math.round((left / viewWidth) * 1000) / 10,
      y: Math.round((top / viewHeight) * 1000) / 10,
      w: Math.round(((right - left) / viewWidth) * 1000) / 10,
      h: Math.round(((bottom - top) / viewHeight) * 1000) / 10,
    };
  }

  function pointOf(el, clientX, clientY) {
    if (clientX != null && clientY != null) {
      return {
        xPct: percent(clientX, window.innerWidth),
        yPct: percent(clientY, window.innerHeight),
      };
    }
    if (!el || !el.getBoundingClientRect) return { xPct: null, yPct: null };
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return { xPct: null, yPct: null };
    return {
      xPct: percent(rect.left + rect.width / 2, window.innerWidth),
      yPct: percent(rect.top + rect.height / 2, window.innerHeight),
    };
  }

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!recording || event.button !== 0) return;
      const target = event.target.closest("a, button, input, textarea, select, label, [role='button']") || event.target;
      if (!target || target.nodeType !== 1) return;
      if (target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (target.matches("input[type='checkbox'], input[type='radio']")) return;
      const labelWrap = target.closest('label');
      if (labelWrap && labelWrap.querySelector("input[type='checkbox'], input[type='radio']")) return;
      const point = pointOf(target, event.clientX, event.clientY);
      send({
        kind: 'click',
        label: labelOf(target),
        xPct: point.xPct,
        yPct: point.yPct,
      },);
    },
    true,
  );

  document.addEventListener(
    'focusin',
    (event) => {
      const target = event.target;
      if (!target || !target.matches || !target.matches('input, textarea')) return;
      const point = pointOf(target);
      focused = {
        el: target,
        value: target.value,
        label: fieldLabel(target),
        sensitive: target.type === 'password' || target.autocomplete === 'current-password',
        xPct: point.xPct,
        yPct: point.yPct,
        box: boxOf(target),
      };
    },
    true,
  );

  function flushField(submit) {
    if (!recording || !focused || !focused.el) return;
    const current = focused.el.value;
    const changed = current !== focused.value;
    if (changed || submit) {
      const point = pointOf(focused.el);
      send({
        kind: 'type',
        label: focused.label,
        value: focused.sensitive ? '' : current,
        sensitive: focused.sensitive,
        xPct: point.xPct == null ? focused.xPct : point.xPct,
        yPct: point.yPct == null ? focused.yPct : point.yPct,
        box: boxOf(focused.el) || focused.box || null,
      },);
    }
    focused = null;
  }

  document.addEventListener(
    'focusout',
    () => {
      flushField(false);
    },
    true,
  );

  document.addEventListener(
    'change',
    (event) => {
      if (!recording) return;
      const target = event.target;
      if (target.matches('select')) {
        const chosen = target.options[target.selectedIndex];
        const point = pointOf(target);
        send({
          kind: 'select',
          label: fieldLabel(target),
          value: chosen ? chosen.text : target.value,
          xPct: point.xPct,
          yPct: point.yPct,
        },);
        return;
      }
      if (target.matches("input[type='checkbox'], input[type='radio']")) {
        const point = pointOf(target);
        send({
          kind: 'check',
          label: fieldLabel(target),
          checked: target.checked,
          xPct: point.xPct,
          yPct: point.yPct,
        },);
      }
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (!recording || event.repeat) return;
      if (event.key === 'Enter' && event.target.matches && event.target.matches('input, textarea')) {
        flushField(true);
        return;
      }
      const shortcut = event.metaKey || event.ctrlKey || event.altKey;
      if (!shortcut) return;
      if (['Control', 'Shift', 'Alt', 'Meta'].indexOf(event.key) >= 0) return;
      const names = [];
      if (event.ctrlKey) names.push('Ctrl');
      if (event.metaKey) names.push('Cmd');
      if (event.altKey) names.push('Alt');
      if (event.shiftKey) names.push('Shift');
      names.push(event.key.length === 1 ? event.key.toUpperCase() : event.key);
      const point = pointOf(event.target);
      send({ kind: 'key', value: names.join('+'), xPct: point.xPct, yPct: point.yPct });
    },
    true,
  );

  let recordingEpoch = 0;

  function rememberNavigation() {
    setTimeout(() => {
      if (!recording) return;
      send({ kind: 'navigate', xPct: null, yPct: null });
    }, 350,);
  }

  const pushState = history.pushState;
  history.pushState = function pushStateHook(...args) {
    const result = pushState.apply(this, args);
    rememberNavigation();
    return result;
  };
  window.addEventListener('popstate', rememberNavigation);
  window.addEventListener('hashchange', rememberNavigation);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'RECORDING') {
      recordingEpoch += 1;
      recording = Boolean(message.on);
    }
    sendResponse({ ok: true });
  },);

  const askedAt = recordingEpoch;
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (recordingEpoch !== askedAt) return;
    if (response && response.guide) recording = Boolean(response.guide.recording);
  },);
}
