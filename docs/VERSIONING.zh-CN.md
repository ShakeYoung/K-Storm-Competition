# K-Storm 封装程序版本管理

## 版本来源

K-Storm 桌面封装程序以根目录 `package.json` 的 `version` 字段作为唯一版本来源。

- Electron Builder 会用该版本生成安装包名称，例如 `K-Storm-2.0.1-arm64.dmg`。
- Electron 运行时通过 `app.getVersion()` 读取同一版本，并注入后端环境变量 `K_STORM_APP_VERSION`。
- 后端 `/api/health` 返回该版本，便于确认当前运行的封装程序和后端服务是否一致。

## 推荐版本规则

采用语义化版本：

- `patch`：修复封装问题、UI 小调整、文档修订，例如 `2.0.0 -> 2.0.1`。
- `minor`：新增参赛演示模式、平台适配、导出能力等向后兼容功能，例如 `2.0.1 -> 2.1.0`。
- `major`：数据结构、API 或工作流不兼容升级，例如 `2.1.0 -> 3.0.0`。

参赛阶段建议额外使用构建标签记录候选包：

- `v2.1.0-competition-rc1`
- `v2.1.0-competition-rc2`
- `v2.1.0-competition-final`

## 发布流程

1. 确认工作树干净，除本次发布内容外没有临时文件。
2. 更新 `package.json` 版本，例如：
   ```bash
   npm version patch --no-git-tag-version
   ```
3. 同步检查 README、架构文档和平台适配说明是否仍与功能一致。
4. 执行构建：
   ```bash
   npm run build:all
   ```
5. 打开封装程序，检查：
   - 图标是否正确显示；
   - 窗口顶部是否可拖动；
   - `/api/health` 版本是否等于 `package.json`；
   - 参赛演示案例是否能一键加载；
   - 107 平台模型配置是否能保存并用于运行。
6. 使用 Git tag 标记可提交版本：
   ```bash
   git tag v2.1.0-competition-rc1
   ```

## 参赛包命名建议

推荐保留 Electron Builder 默认包名，并在提交材料中使用更清晰的目录名：

```text
K-Storm-107-v2.1.0-competition-rc1/
  K-Storm-2.1.0-arm64.dmg
  设计文档.pdf
  演示视频.mp4
  平台适配说明.md
  示例输入与输出/
```

这样既保留自动化构建的版本号，也便于比赛材料归档和复盘。
