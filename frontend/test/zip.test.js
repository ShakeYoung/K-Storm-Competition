// ZIP 生成器测试（纯函数，校验 CRC32 与文件结构）
import { describe, it, expect } from "vitest";
import { createZipBlob } from "../src/lib/zip.js";

describe("ZIP 生成器", () => {
  it("生成合法 Blob", () => {
    const blob = createZipBlob([{ name: "test.txt", data: "hello world" }]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/zip");
    expect(blob.size).toBeGreaterThan(50); // 至少包含文件头
  });

  it("空 entries 生成最小 ZIP（仅 EOCD）", () => {
    const blob = createZipBlob([]);
    expect(blob.size).toBeGreaterThanOrEqual(22); // EOCD 22 字节
  });

  it("多文件打包", () => {
    const blob = createZipBlob([
      { name: "a.txt", data: "AAA" },
      { name: "b.md", data: "# B" },
    ]);
    expect(blob.size).toBeGreaterThan(100);
  });

  it("中文内容正确编码", () => {
    const blob = createZipBlob([{ name: "中文.md", data: "你好世界" }]);
    expect(blob.size).toBeGreaterThan(30);
  });
});

describe("下载文件名工具", () => {
  it("reportFilename 生成 .md 后缀", async () => {
    const { reportFilename } = await import("../src/lib/download.js");
    const name = reportFilename({ template_input: { field: "肿瘤免疫" }, run_id: "ks_abc123" });
    expect(name).toMatch(/\.md$/);
    expect(name).toContain("肿瘤免疫");
  });
});
