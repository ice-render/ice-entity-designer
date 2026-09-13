# AGENTS.md — ice-entity-designer

## 项目定位

基于 **ice-render** 内核的领域设计器合集（ER / 流程图 / BPMN / UML / 状态机 / 甘特 / 电力一次 / 电力二次），
领域图元以 `ice-entity-designer:*` 命名空间注册；`examples/*.html` 是可直接打开的完整编辑器。

## 分支与发版约定（家族铁律，2026-09-13 确立）

- **开发**：一律在 `dev`（或从它切出来的临时分支）上做；`master` 只做集成与发版。
- **发版前**：必须先把 `dev` 合并进 `master`，**再从 `master` 发版**（跑门禁 → `npm publish`）。
- **禁止**：直接在 `master` 上写实现，也禁止只更新 `dev` 而让 `master` 停在旧版本 ——
  本仓 2026-09-13 踩过：远端默认分支是 `master`，而 0.2.x 全发在 `dev` 上，
  仓库首页长期显示 0.0.40 时代的代码（后来才补上快进）。远端默认分支必须指向 `master`，
  且发版后它与 `dev` 内容一致。
- 本仓主线名：`dev`（开发）+ `master`（发版）；远端 `origin`（Gitee）+ `origin-github`（GitHub），两处都要推。

## 门禁

- `npm run lint`（eslint，0 error 起步）/ `npm run types:check` / `npm test`（jest 315 用例）/ `npm run build`
- `npm run test:e2e`：Playwright，覆盖 9 个编辑器示例页（含 BPMN 令牌仿真）

## 引擎契约

仿真 / 动画等应用层逐帧逻辑必须遵守引擎的帧调度契约：自行监听 `ICE_FRAME_EVENT` 做计算时，
要 `ice.setContinuousFrames(true)`（用完归还），否则引擎空闲停帧会让逻辑停摆
（见 `src/bpmn/BpmnSimulator.ts` 的 `__acquireContinuousFrames`）。

**连线端点手柄（hook / slot）**：本仓所有域包的连线都是 `transformable: false`（记法不可变换，
不给旋转/缩放手柄）—— 这**不影响**"点连线出现端点手柄、拖动端点改连接"的能力
（引擎把端点手柄独立到 `linkEditable` 默认开；该修复在引擎 dev 上，随下一个补丁版发布）。
回归：`e2e/link-hooks.spec.ts`（点线 → 手柄可见 →
拖拽中出插槽 → 落在插槽上改接）。改 `Relation` / 各域包连线类时不要动 `transformable` 的语义，
也不要往 `project_codec.ts` 之外新增 state 键（`tests/designer/codec-completeness.test.ts` 会拦）。
