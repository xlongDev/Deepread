# ADR-0005 · Cargo workspace 与 src-tauri 位置

- 状态:Accepted(2026-09-08)
- 背景:spec 示例将 `src-tauri/` 放在根目录;同时 monorepo 需要统一 `cargo check/test` 入口。
- 决策:
  1. Tauri crate 位于 `apps/desktop/src-tauri`(Tauri 2 官方 monorepo 惯例,未来 `apps/mobile` 共享内核 crate 更自然);
  2. 仓库根为 Cargo virtual workspace(`members = ["apps/desktop/src-tauri"]`),根 `cargo check/test/fmt/clippy` 覆盖全部 Rust 代码;
  3. lib crate 命名 `reader_desktop_lib`(staticlib/cdylib/rlib 三 target),为 Tauri Mobile 预留,main.rs 仅作薄入口;
  4. 公共依赖收敛在 `[workspace.dependencies]`。
- 后果:与 spec 示例目录不同(允许,分层不变);CI rust job 需先 `mkdir -p apps/desktop/dist`(tauri-build 校验 frontendDist 存在)。
