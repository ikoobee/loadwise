# LoadWise

Container loading planner for cross-border shipping. Deterministic,
constraint-aware 3D packing engine plus tooling around it.

## 快速命令

- 安装依赖：`pnpm install`
- 测试：`pnpm test`（vitest）
- 类型检查：`pnpm typecheck`

## 结构导览

- `packages/core/` — `@loadwise/core` 引擎：领域模型、约束体系、L1 求解器（EP-FFD）、方案校验器、标准柜型库。纯函数、零依赖、确定性输出。

## 本项目专属约定

- **确定性是契约**：core 代码禁用 `Math.random`、时间戳、`Date.now`、Map/Set 迭代序依赖；所有排序必须带全序 tie-breaker。CI 测试含双跑一致性断言。
- **坐标系固定**：`x` = 宽度（左→右），`y` = 深度（柜尾 0 → 柜门），`z` = 高度（地面 0）。全系统唯一约定，勿引入第二套。
- **纯函数纪律**：core 不得 import DOM / Node API / 网络；保持浏览器与服务器同构可运行。
- **黄金集（bench/）**：用例在 `bench/cases/*.json`（只放合成数据，严禁真实客户数据）；指标快照在 `bench/snapshots/`，确定性下必须与提交的快照一致。快照测试失败 = 求解器行为变化，需人工审查后用 `UPDATE_SNAPSHOTS=1 pnpm test` 重新生成；引擎版本升级同样需要重新生成（快照含 engineVersion 字段）。
- **约束检查对齐纪律**：solver 内的可行性检查（支撑、堆叠容量、重叠）必须与 `validate.ts` 的判定集合一致——两处判定集合出现差异就是约束逃逸（黄金集首跑抓到过一例：采样点命中 vs 投影相交的集合不一致导致超叠）。
- **注释与 commit 用英文**（开源目录规范）；与用户交流用中文。
- 方案 JSON Schema（`LoadPlan`）只增不破；改动需同步 `validate.ts` 与测试快照。
