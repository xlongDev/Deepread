# Testing Guide

四层测试策略(spec §77)。命名: colocated `*.test.ts(x)`(前端)、Rust `#[cfg(test)]` 模块。

## 1. Unit

覆盖纯逻辑,不触碰 IPC/文件系统:

- `@reader/shared`:错误归一化、Logger 脱敏/截断、协议 schema。
- `@reader/design-system`:令牌不变量(CSS/TS 对齐、饱和度约束、半径单调、弹簧参数)。
- Rust:错误序列化、时间格式、事件命名映射、命令校验(纯 `*_impl` 函数)。

## 2. Component(前端)

`@testing-library/react` + jsdom。约定:mock 边界在 `lib/ipc` 模块层(不 mock Tauri 全局);必须断言 loading / error / 空状态,而非只断言成功路径。

## 3. Contract

跨端形状一致性由"双端镜像测试"承担:TS zod 测试断言 wire 形状,Rust serde 测试断言相同形状(camelCase、字段省略规则、错误码目录)。新增 Provider(ReaderEngine/AIProvider/TTSProvider/…)时,先建契约测试套件,再写实现(spec §55)。

## 4. Integration / E2E(Phase 1 起)

- Integration:导入→打开→进度→批注→备份→恢复(真实文件、真实 SQLite)。
- E2E:Import → Open → Read → Annotate → Close → Reopen(进度恢复);AI 流程含引用校验。

## 运行

```bash
pnpm test        # 前端全部包
cargo test --workspace
```

## 规则

1. 测试不允许 mock 被测逻辑本身,只 mock 边界(IPC、时钟、随机)。
2. 修复 bug 必须先补复现测试。
3. CI 中任一门禁失败即失败,禁止本地跳过标记(`skip`)进入主干。
