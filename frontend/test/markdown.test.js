// 前端 lib 纯函数测试（vitest，无需 DOM）
import { describe, it, expect } from "vitest";
import { markdownToHtml, escapeHtml, inlineMarkdown, isTableLine, highlightKeyword } from "../src/lib/markdown.js";

describe("markdown 渲染器", () => {
  it("标题降级到 h3（封顶）", () => {
    expect(markdownToHtml("# 大标题")).toContain("<h1>");
    expect(markdownToHtml("###### 六级")).toContain("<h3>"); // 封顶 h3
  });

  it("无序/有序列表", () => {
    expect(markdownToHtml("- 项目一\n- 项目二")).toContain("<ul>");
    expect(markdownToHtml("1. 第一\n2. 第二")).toContain("<ol>");
  });

  it("代码块", () => {
    const html = markdownToHtml("```\ncode here\n```");
    expect(html).toContain("<pre><code>");
    expect(html).toContain("code here");
  });

  it("表格", () => {
    expect(isTableLine("| a | b |")).toBe(true);
    expect(isTableLine("普通文本")).toBe(false);
    const html = markdownToHtml("| 列1 | 列2 |\n|---|---|\n| 值1 | 值2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>列1</th>");
  });

  it("转义防止 XSS", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toContain("&lt;script&gt;");
    expect(escapeHtml('"quote"')).toContain("&quot;");
  });

  it("行内粗体与代码", () => {
    expect(inlineMarkdown("**粗**")).toContain("<strong>粗</strong>");
    expect(inlineMarkdown("`code`")).toContain("<code>code</code>");
  });

  it("JSON fallback 渲染", () => {
    const html = markdownToHtml('{"version":"1.5","data":"x"}');
    expect(html).toContain("json-fallback-notice");
  });

  it("空输入返回空", () => {
    expect(markdownToHtml("")).toBe("");
    expect(markdownToHtml(null)).toBe("");
  });
});

describe("关键词高亮", () => {
  it("高亮匹配文本不动标签属性", () => {
    const html = "<p>研究蛋白质折叠</p>";
    const result = highlightKeyword(html, "蛋白质");
    expect(result).toContain("<mark");
    expect(result).toContain("蛋白质");
  });

  it("空关键词原样返回", () => {
    expect(highlightKeyword("<p>x</p>", "")).toBe("<p>x</p>");
  });

  it("特殊字符转义不崩溃", () => {
    const result = highlightKeyword("<p>test</p>", "(");
    // "(" 在文本中无匹配，应原样返回不崩溃
    expect(result).toBe("<p>test</p>");
  });
});
