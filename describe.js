((root) => {
  function clip(value, max) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text;
    return text.slice(0, max) + '…';
  }

  function describeStep(event) {
    const label = clip(event.label, 48);
    const page = clip(event.pageTitle, 60);
    const value = clip(event.value, 80);
    switch (event.kind) {
      case 'navigate':
        return page ? '打开页面「' + page + '」' : '打开页面';
      case 'click':
        return label ? '点击「' + label + '」' : '点击页面';
      case 'type':
        if (event.sensitive) return '在「' + (label || '密码框') + '」输入密码';
        if (!value) return '在「' + (label || '输入框') + '」清空内容';
        return '在「' + (label || '输入框') + '」输入「' + value + '」';
      case 'select':
        return '在「' + (label || '下拉框') + '」选择「' + (value || '空') + '」';
      case 'check':
        return (event.checked ? '勾选「' : '取消勾选「') + (label || '选项') + '」';
      case 'key':
        return '按下 ' + (event.value || '快捷键');
      case 'note':
        return value || '补充说明';
      default:
        return label || '操作';
    }
  }

  root.describeStep = describeStep;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { describeStep };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
