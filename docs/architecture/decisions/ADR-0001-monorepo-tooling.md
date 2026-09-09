# ADR-0001 · Monorepo 工具链与依赖准入

- 状态:Accepted(2026-09-08)
- 背景:spec 要求 pnpm workspace + 分层包结构;CI 必须可复现。
- 决策:
  1. pnpm workspace(`apps/*`、`packages/*`),**不引入 Turborepo/Nx** —— Phase 0 的任务图仅两层,`pnpm -r` 足够;待构建超过 10s 或出现跨包任务编排需求时再评估(届时补 ADR)。
  2. 内部包直接发布 TypeScript 源码(`exports` 指向 `src/index.ts`),由消费方 bundler(Vite/Vitest)编译 —— 不引入 tsup/unbuild 构建步骤(见 ADR-0002)。
  3. 依赖准入清单:维护活跃度、License(禁 GPL/AGPL 进入产品依赖,允许 devDependency 工具)、体积、安全、平台支持;为 <100 行的功能禁止引入依赖。
  4. 构建脚本白名单:目前仅 `esbuild`(pnpm `onlyBuiltDependencies`);平台二进制包确保无 postinstall 也能运行。
- 后果:Phase 0 零构建编排依赖;锁文件入库;关键工具显式锁版(typescript 5.9.3,规避镜像元数据问题 R4)。
