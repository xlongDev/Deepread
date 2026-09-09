# ADR-0002 · 内部包以 TypeScript 源码形式分发

- 状态:Accepted(2026-09-08)
- 背景:`packages/*` 均为私有内部包。常规做法是为每个包配置 tsc/tsup 构建产物(dts + js),代价是:每个包的构建脚本、watch 编排、构建顺序错误(`dist` 缺失)与陈旧产物风险。
- 决策:内部包 `exports` 直接指向 `./src/index.ts`;类型检查由各包 `tsc --noEmit` 与消费方共同完成;运行时编译交给 Vite/Vitest(bundler resolution)。
- 理由:
  - 所有消费方都是 Vite/Vitest —— 它们原生处理 TS 源;
  - 消除"忘记 build 包"这类整类错误;
  - 符合"最小实现"原则。
- 限制:外部消费(发布 npm)不可行 —— 本项目所有包均为 private,不构成限制。未来若需发布,再为该包加构建步骤(局部改动)。
- 与 spec 的关系:spec 的目录结构允许"实际结构可以调整",分层不受影响。
