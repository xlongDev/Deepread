# Deepread

> 以阅读为核心、AI 为增强、知识管理为延伸的 Local-first、Privacy-first 跨平台个人阅读操作系统(Personal Reading OS)。

技术栈:**Tauri 2 · Rust · React 19 · TypeScript(strict)· Vite · Vitest**。完整工程规范见仓库根目录的《全平台 AI 电子书阅读器|工程实施版》。

## 当前状态:Phase 1 · 内核里程碑 ✅

已完成:monorepo 骨架、类型安全 IPC、统一错误系统、Logger、Design Token 系统、CI 全门禁,以及 **foliate-js 唯一渲染内核的完整接入**(ADR-0006):真实 EPUB/PDF 已在浏览器 E2E 中验证渲染、翻页、目录、CFI 进度锚点、选区划线。

书架(Phase 1):桌面端经系统对话框导入 → Rust 流式哈希入册(文件**留在原位**,经 asset 协议流式读取)→ 列表/移除;阅读器支持书签与全书搜索。阅读进度、划线、书签按书籍哈希持久化(Rust 端)。

格式支持(只列真实验证过的能力,不伪造):

| 格式                    | 状态                                            |
| ----------------------- | ----------------------------------------------- |
| EPUB                    | ✅ 浏览器 E2E 验证                              |
| PDF                     | ✅ 浏览器 E2E 验证(内核官方适配器 + pdfjs-dist) |
| MOBI / AZW3 / FB2 / CBZ | ✅ 内核原生解析(真书样本回归待补)               |
| TXT / Markdown          | ✅ 适配器实现内核 book 接口(不转译文本)         |
| CHM                     | ❌ 内核无解析器,如实报错                        |

开发速览:

```bash
pnpm install
pnpm fixtures   # 生成测试书(EPUB/FB2/TXT/MD/PDF)+ PDF.js 支持资源
pnpm dev        # 浏览器开发模式;?open=/fixtures/夜航书.epub 可直开一本书
pnpm tauri dev  # 桌面应用开发模式(阅读进度/划线持久化走 Rust 端)
```

## 目录结构

```text
apps/desktop/          Tauri 2 桌面应用(React 壳 + Rust 后端)
packages/shared/       类型 / 错误系统 / Logger / IPC 协议(唯一全局依赖)
packages/design-system/Design Tokens(CSS+TS 双源)+ Motion Tokens
packages/reader-core/  ReaderEngine 契约(内核适配器于 Sprint 4 落地)
docs/architecture/     架构报告 / 领域模型 / 协议 / 风险 / ADR
```

分层与依赖规则、协议约定、ADR 见 [docs/architecture/overview.md](docs/architecture/overview.md)。

## 开发

```bash
pnpm install              # 安装依赖
pnpm dev                  # 前端开发模式(浏览器,IPC 不可用时 UI 显示错误态)
pnpm tauri dev            # 完整桌面应用开发模式
```

> 注意:pnpm 使用镜像源时请核对实际解析的依赖版本(本项目已显式锁定 typescript)。

## 质量门禁(必须全绿)

```bash
pnpm lint            # ESLint(strict typescript-eslint)
pnpm format:check    # Prettier
pnpm typecheck       # tsc --noEmit(所有包)
pnpm test            # Vitest(所有包)
pnpm build           # tsc + vite build

cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo check --workspace --all-targets
cargo test --workspace
```

或直接 `pnpm cargo:check` / `pnpm cargo:test` / `pnpm cargo:fmt` / `pnpm cargo:clippy`。

> Rust 首次编译需数分钟;CI(rust job)会先安装 Tauri Linux 系统依赖。

## 规范与约定

- Conventional Commits(`feat: / fix: / refactor: / perf: / test: / docs: / chore:`)。
- 协议变更必须同步 `docs/architecture/protocol.md` 与两侧测试。
- 架构决策记录到 `docs/architecture/decisions/ADR-*`。
- 测试策略见 [docs/development/testing.md](docs/development/testing.md)。

## Roadmap

| Phase | 内容                                                       | 状态    |
| ----- | ---------------------------------------------------------- | ------- |
| 0     | 工程骨架 / 协议 / 错误 / Logger / Tokens / CI              | ✅ 当前 |
| 1     | Core Reader:导入、书架、EPUB/TXT/PDF、进度、书签、批注     | ⬜      |
| 2     | Premium Reading:Liquid Glass、主题、排版、双页、选择工具栏 | ⬜      |
| 3     | AI Foundation:Provider、流式、RAG、引用                    | ⬜      |
| 4     | AI Book Intelligence:精修、Diff、摘要、角色、知识图谱      | ⬜      |
| 5     | TTS / Learning:多角色语音、闪卡、测验、间隔重复            | ⬜      |
| 6     | Cloud:账号、同步、冲突、WebDAV、备份                       | ⬜      |
| 7     | Cross Platform:macOS / Windows / Linux / Android / iOS     | ⬜      |
| 8     | Production:更新器、崩溃恢复、安全审计、发布管线            | ⬜      |
