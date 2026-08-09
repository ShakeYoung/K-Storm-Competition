# K-Storm 版本管理

> 当前交付形态：**前后端参赛版**（v2.1.0）。桌面封装（Electron + PyInstaller）已剥离，作为后续阶段；本仓库只保留前后端调试与参赛演示所需内容。

## 版本来源

K-Storm 以根目录 `package.json` 的 `version` 字段作为唯一版本来源：

- 后端 `/api/health` 返回该版本（`resolve_app_version()` 读取根 `package.json`）。
- 前端构建产物不携带版本，版本以 API 返回为准。

## 推荐版本规则

采用语义化版本：

- `patch`：修复缺陷、UI 小调整、文档修订，例如 `2.1.0 -> 2.1.1`。
- `minor`：新增参赛演示模式、平台适配、导出能力等向后兼容功能，例如 `2.1.0 -> 2.2.0`。
- `major`：数据结构、API 或工作流不兼容升级，例如 `2.1.0 -> 3.0.0`。

参赛阶段建议额外使用构建标签记录候选包：

- `v2.1.0-competition-rc1`
- `v2.1.0-competition-rc2`
- `v2.1.0-competition-final`

## 发布流程（前后端参赛版）

1. 确认工作树干净，除本次发布内容外没有临时文件。
2. 更新 `package.json` 版本，例如：
   ```bash
   npm version patch --no-git-tag-version
   ```
3. 同步检查 README、架构文档和平台适配说明是否仍与功能一致。
4. 执行验证：
   ```bash
   cd backend && python -m pytest tests/ -q     # 60+ 个后端测试全绿
   cd ../frontend && npm run build              # 前端生产构建
   ```
5. 手动冒烟检查：
   - 后端 `uvicorn app.main:app --port 8000` 启动，`/api/health` 版本与 `package.json` 一致；
   - 前端 `npm run dev` 打开 <http://localhost:5173>，用「参赛演示模式」一键跑通一个完整讨论；
   - 107 平台模型「⚡ 一键配置」能读取全部模型并生成推荐分配；
   - 讨论中途失败后「继续分析」能按原模式恢复。
6. 使用 Git tag 标记可提交版本：
   ```bash
   git tag v2.1.0-competition-rc1
   ```

## 桌面封装（后续阶段）

重新封装时沿用以下规则：

- Electron Builder 用根 `package.json` 版本生成安装包名称，例如 `K-Storm-2.1.0-arm64.dmg`。
- Electron 运行时通过 `app.getVersion()` 读取同一版本，并注入后端环境变量 `K_STORM_APP_VERSION`。
- 用户数据目录沿用 `K_STORM_DATA_DIR` 环境变量约定（当前默认 `data/ks.sqlite3`）。
- 打包命令建议恢复为根级 `npm run build:all`（Electron 主进程 + 后端冻结 + 前端产物同步），并在恢复时补回 `electron/` 与 PyInstaller 配置。

## 参赛包命名建议

推荐在提交材料中使用清晰的目录名：

```text
K-Storm-107-v2.1.0-competition-rc1/
  K-Storm-2.1.0-arm64.dmg        # 桌面封装（若完成）
  演示视频.mp4
  平台适配说明.md
  示例输入与输出/
```
