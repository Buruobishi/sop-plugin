const { describeStep } = require("../describe.js");

function assert(name, actual, expected) {
  if (actual !== expected) {
    console.error(name + "\n  实际: " + actual + "\n  期望: " + expected);
    process.exitCode = 1;
  }
}

assert("打开页面", describeStep({ kind: "navigate", pageTitle: "工作台" }), "打开页面「工作台」");
assert("点击", describeStep({ kind: "click", label: "AI 视频翻译" }), "点击「AI 视频翻译」");
assert("点击空白", describeStep({ kind: "click", label: "" }), "点击页面");
assert("输入", describeStep({ kind: "type", label: "项目名", value: "测试片" }), "在「项目名」输入「测试片」");
assert("密码", describeStep({ kind: "type", label: "密码", sensitive: true, value: "secret" }), "在「密码」输入密码");
assert("选择", describeStep({ kind: "select", label: "原始语言", value: "英语" }), "在「原始语言」选择「英语」");
assert("勾选", describeStep({ kind: "check", label: "字幕擦除", checked: true }), "勾选「字幕擦除」");
assert("取消", describeStep({ kind: "check", label: "字幕擦除", checked: false }), "取消勾选「字幕擦除」");
assert("快捷键", describeStep({ kind: "key", value: "Cmd+S" }), "按下 Cmd+S");
const longLabel = "一二三四五六七八九十".repeat(6);
assert("截断", describeStep({ kind: "click", label: longLabel }).endsWith("…」"), true);
