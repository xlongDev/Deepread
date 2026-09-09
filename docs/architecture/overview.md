# Architecture Overview

> Phase 0 基线(Sprint 0–1 产物)。本文档是活的架构报告,每个 Phase 结束后更新。

## 1. 当前项目结构

```text
/
├── apps/
│   └── desktop/                 # Tauri 2 桌面应用(Phase 7 前为唯一应用)
│       ├── src/                 # React UI(壳 + 类型安全 IPC)
│       └── src-tauri/           # Rust 后端(commands / error / events / timestamps)
├── packages/
│   ├── shared/                  # 类型、错误系统、Logger、IPC Protocol(唯一被所有层依赖的包)
│   ├── design-system/           # Design Tokens(CSS + TS 双源,测试对齐)+ Motion Tokens
│   └── reader-core/             # ReaderEngine 契约(Phase 0 仅契约,FoliateAdapter 于 Sprint 4 落地)
├── docs/architecture/           # 本文档 + domain-model / protocol / risks / ADR
├── scripts/                     # 工具脚本(应用图标生成)
└── .github/workflows/ci.yml     # lint / typecheck / test / build / cargo 全门禁
```

已规划的目录(随 Phase 增量创建,**不提前创建**):`packages/reader-adapters`、`epub`、`pdf`、`text`、`ai-core`、`ai-providers`、`rag`、`tts`、`dictionary`、`notes`、`sync`、`storage`、`protocol`(schema 代码生成)、`apps/mobile`。

## 2. 技术栈

| 层         | 选型                                        | 版本策略       |
| ---------- | ------------------------------------------- | -------------- |
| 框架       | Tauri 2                                     | 最新稳定 2.x   |
| 后端       | Rust (edition 2024)                         | 最新稳定工具链 |
| 前端       | React 19 + TypeScript 5(strict)             | 最新稳定       |
| 构建       | Vite 7 + pnpm workspace                     | 最新稳定       |
| 测试       | Vitest 3(前端)+ 内置 `#[test]`(Rust)        | 最新稳定       |
| 运行时校验 | zod 4(协议边界)                             | 最新稳定       |
| 日志       | 自研 Logger(前端)+ `tauri-plugin-log`(Rust) | —              |

依赖准入规则见 ADR-0001:不为小功能引入重依赖;引入前评估维护度/许可证/体积/安全。

## 3. 模块边界(依赖方向,禁止反向)

```text
UI (apps/desktop/src)
  ↓ 只允许依赖
packages/* 的公共 API(经 package.json exports 暴露的入口)
  ↓
Application / Domain(Phase 1 起逐步显式化)
  ↓
Infrastructure(src-tauri、foliate-js Adapter、Storage)
```

已强制的边界:

- **UI 不直接调用 Tauri IPC**:唯一入口是 `apps/desktop/src/lib/ipc.ts`;响应一律过 zod 校验,失败一律归一化为 `AppError`。
- **业务层不直接依赖 foliate-js**:只能依赖 `@reader/reader-core` 的 `ReaderEngine`(契约见该包 `engine.ts`)。
- **shared 不依赖 Tauri / DOM**:保持运行时中立,可在 Node(测试)与 WebView 两端运行。
- **Rust commands 薄壳化**:校验与组装在纯函数(`*_impl`)中,无需 Tauri 运行时即可单测。

## 4. 数据流(Phase 0 已验证的部分)

```text
UI 事件 → invokeCommand('app.info', undefined)
        → Tauri IPC(Rust command)
        → 纯函数组装(serde 类型化请求 + 显式校验)
        → Result<T, AppError>(camelCase 序列化)
        → 前端 zod 校验响应 → App 状态机(loading / ready / error)
```

事件流:`Rust setup → app:ready(transport) → (Phase 1 起前端 listenEvent 订阅)`。
逻辑名↔传输名映射规则见 `docs/architecture/protocol.md`。

## 5. IPC 设计

- 命令与事件目录:`packages/shared/src/protocol/`(TS 侧 single source of truth)。
- Rust 侧以 serde 类型镜像,两侧一致性由三重测试锁定:TS zod 测试、Rust serde 测试、命令响应字段的 camelCase 断言。
- 错误:所有命令返回 `Result<T, AppError>`;wire 格式 `{ code, message, cause?, retryable, context? }`(ADR-0004)。
- Sprint 2 计划引入 Schema-first 代码生成(Rust → TS types),消除手工镜像(见 Risks)。

## 6. 状态管理

Phase 0 只使用 React 局部状态(`useState`)。规划(Phase 1 定稿):

- **UI State**:组件局部 / 轻量 Context(工具栏开合、面板)。
- **Domain State**:按 Domain 拆分的 store(候选 Zustand,Phase 1 ADR 定夺);禁止 God Store。
- **Server State**(IPC 数据):调用处局部缓存 + 事件失效;必要时引入 TanStack Query(ADR 待定)。
- **Persistent State**:一律走 Rust 侧 Storage(Sprint 3),前端不落敏感数据。

## 7. Storage(Phase 0 未实现,Sprint 3 落地)

规划:`Repository → Storage trait(Rust)→ SQLite`。要求:Migration、Versioning、Backup/Restore、损坏恢复;数据库模型不得暴露给 UI(经 Command + DTO)。

## 8. Reader Engine

契约已定(`packages/reader-core/src/engine.ts`),含 `open/close/metadata/toc/location/goTo/page/search/text/annotation/theme/layout/destroy`。

- Sprint 4 落地 `FoliateAdapter`;业务层只 import `ReaderEngine`。
- PDF 不与 EPUB 共享渲染实现,只共享 Domain 契约(spec §112)。
- 契约测试(Contract Test)框架在 Phase 0 已有雏形(`engine.test.ts` 的 probe),Sprint 4 扩展为完整行为契约套件。

## 9. AI Architecture(Phase 3)

规划:`UI → AIService → AIProvider(interface)→ Provider Adapter`。禁止 UI 直连任何厂商 API。Provider 必须支持 timeout / retry / stream / cancel / 错误归一化(复用 `AppError`)。API Key 只存 OS Keychain(Phase 3 落地)。

## 10. Sync Architecture(Phase 6)

规划:`Local First → Sync Queue → SyncEngine → CloudProvider(可替换:自建/Supabase/WebDAV)`。冲突策略按数据类型区分(Progress=latest、Notes/Annotations=merge、Metadata=field merge),不允许全局 LWW。

## 11. Security(已实施)

- 生产 CSP 收紧(default-src 'self' 等,见 `tauri.conf.json`);dev 模式走 devUrl(放宽为已记录的已知妥协)。
- IPC 响应/事件 payload 按不可信输入处理:zod 校验后才进入 UI。
- Rust 请求体 `deny_unknown_fields`;nonce 长度上限。
- 前端 Logger 默认脱敏(apiKey/token/password 等)+ 长文本截断,书籍正文不可能进入日志。
- API Key:禁止 localStorage/明文(Phase 3 接 Keychain 时强制)。

## 12. Testing

四层策略(spec §77),Phase 0 覆盖:

- **Unit**:shared(errors/logger/protocol)、design-system(令牌不变量)、reader-core(契约 probe)、Rust(error/time/events/system)。
- **Component**:App 状态机(loading/ready/error/retry/theme)。
- **Contract**:协议两侧形状一致性(将随 Provider 落地扩展为统一 Contract Test 套件)。
- **Integration / E2E**:Phase 1 起(Import → Open → Read → Annotate → Reopen)。

CI 门禁:`pnpm lint / format:check / typecheck / test / build` + `cargo fmt --check / clippy -D warnings / test`。

## 13. 风险

见 `docs/architecture/risks.md`(含缓解与触发条件)。

## 14. 技术债(Phase 0 新增)

| 债                                               | 影响                           | 偿还计划                                           |
| ------------------------------------------------ | ------------------------------ | -------------------------------------------------- |
| 协议类型 TS/Rust 手工镜像                        | 两端漂移风险(已有测试缓解)     | Sprint 2 Schema-first 代码生成                     |
| dev 模式 CSP 放宽                                | 仅开发期                       | 保持生产 CSP 收紧;dev CSP 随安全审计(Phase 8)复核  |
| `tauri::command(rename)` 点号名依赖 Tauri ≥ 2.11 | 锁定 tauri 最低版本            | 已知悉;升级时回归验证                              |
| ReaderEngine 契约未经真实内核验证                | 契约可能随 foliate-js 实测调整 | Sprint 4 落地 FoliateAdapter 时修订并补 ADR        |
| 尚无 git 仓库                                    | 无版本历史                     | 待用户确认后 `git init`(遵循 Conventional Commits) |

## 15. 实施顺序

按总规范 Phase 0–8 执行;Phase 0 = 当前里程碑(工程骨架 + 协议 + 令牌 + 全门禁通过)。

下一阶段 **Phase 1(Core Reader)**:Sprint 2(Protocol 代码生成)→ Sprint 3(Storage)→ Sprint 4(FoliateAdapter/EPUB)→ Sprint 5(Library/导入)→ Sprint 6(Reader UX)。
