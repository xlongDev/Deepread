# ADR-0004 · 统一错误模型

- 状态:Accepted(2026-09-08)
- 背景:spec §39/§60 要求统一错误码与 `{ code, message, cause, retryable, context }` 形状;禁止底层错误直达 UI。
- 决策:
  1. wire 格式(跨 IPC / 跨层):`AppErrorPayload { code, message, cause?, retryable, context? }`,`cause` 为字符串化根因链,`context` 为 JSON 对象;
  2. TS 侧 `AppError extends Error` 携带同字段,`toAppError()` 归一化一切抛出值;前端在 IPC 边界 zod 校验错误形状;
  3. Rust 侧 `AppError` 结构 + 手写 `Serialize`(保证字段顺序无关、省略 None),`ErrorCode` 为枚举、`as_str()` 与 TS 目录由测试锁定;
  4. 展示规则:UI 只消费 `code` + `message`;`cause` 只进日志;`retryable` 决定重试 UI。
- 错误码目录增长规则:每个新 Domain 落地时,在同一 PR 内新增其错误码 + 两侧测试。
