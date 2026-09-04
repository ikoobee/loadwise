# LoadWise

[![CI](https://github.com/ikoobee/loadwise/actions/workflows/ci.yml/badge.svg)](https://github.com/ikoobee/loadwise/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-green.svg)](CHANGELOG.md)

**[English](README.md)**

面向跨境物流的确定性约束装柜引擎。输入货物清单与柜型，输出满足真实硬约束的 3D 装载方案——载重限制、堆叠规则、旋转约束、货物间隙、底部支撑——且同输入逐字节可复现。

## 为什么需要

Excel 只能估，LoadWise 是算。算不准的装柜方案代价真实：纯重货浪费容积、纯抛货浪费载重、订舱后装不下。现有开源止步于装箱算法库；LoadWise 建模出口物流中真正要紧的约束，并输出可审计的方案。

## 当前能力

- `solveL1` —— L1 求解器（极点法首适应递减 EP-FFD），交互级速度：266 件五 SKU 清单约 350ms，2000 件输入约 190ms
- 硬约束：总重、单件堆叠上限（`maxStackOn`）、旋转模式（任意/立放/固定）、箱间间隙、≥75% 底面支撑
- `validatePlan` —— 独立方案校验器，复用同一套不变式（可审计任何方案，包括手工修改或第三方生成的）
- 标准柜型库：20GP / 40GP / 40HQ / 45HQ / 13.5m 厢式车
- 重心报告与重量/体积受限告警（W/M 重抛意识）
- 确定性输出，每个方案带引擎版本号

## 快速开始

```bash
git clone git@github.com:ikoobee/loadwise.git
cd loadwise
pnpm install
pnpm test        # 11 个测试全绿
```

TypeScript 调用示例见 [README.md](README.md) 的 Quick Start（英文主文档维护完整示例）。

## 设计保证

- **确定性是契约**：同引擎版本 + 同输入 ⇒ 完全相同输出。无随机、无时间戳、全序 tie-breaker，CI 双跑一致性测试强制。
- **纯函数**：core 零依赖、不碰 DOM/文件系统/网络——浏览器 Worker、Node、未来原生移植行为一致。
- **方案 Schema 稳定**：`LoadPlan` JSON 版本化、只增不破；旧版本产出的方案永远可渲染。

## 路线图

- Web 可视化：分步 3D 动画 + 可打印装载指导书
- CLI（`loadwise plan manifest.xlsx -o plan.json`）
- 自托管 HTTP API + Docker 镜像
- 公开基准集（`bench/`）与逐版本结果快照

各版本变更见 [CHANGELOG.md](CHANGELOG.md)。

## 参与贡献

欢迎 issue 与 PR。贡献即视为按本项目 MIT 许可证授权（inbound = outbound）。

## 许可证

[MIT](LICENSE) © 2026 Ethan (ikoobee)
