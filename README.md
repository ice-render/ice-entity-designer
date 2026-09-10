<p align="center">
  <img width="120" src="./tests/assets/ice-entity-designer.png" alt="ice entity designer" />
</p>

<h1 align="center">IED · ice entity designer</h1>

<p align="center">基于 ice-render 的可视化 ER 建模工具：拖拽建图，一键导出 TypeORM Schema。</p>

<p align="center">
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-047857.svg" /></a>
  <img alt="ice-render" src="https://img.shields.io/badge/ice--render-%3E%3D%201.0.4-4338ca.svg" />
  <img alt="tests" src="https://img.shields.io/badge/jest-15%20passed-047857.svg" />
  <img alt="typescript" src="https://img.shields.io/badge/TypeScript-4.6-3178c6.svg" />
</p>

## 1. 项目定位

IED（ice entity designer）是基于 [ice-render](https://github.com/ice-render/ice-render) 构建的**可视化 Entity-Relation 建模工具**。它以「节点 = 实体，连线 = 关系」组织数据模型，把画布上的设计结果序列化为符合 TypeORM `EntitySchema` 规范的 Schema，从而将「结构设计」与「实体类 / CRUD 代码生成」直接衔接。

它不重复实现底层图元，而是在 ice-render 的通用图编辑内核之上，收敛出 ER 建模最常用的交互闭环：选择、创建、更新、删除、关系连接、校验与 Schema 输出。

完整使用案例请参见：

- <https://github.com/craft-codeless-designer/craft-codeless-designer-server-koa>

## 2. 核心能力

### 可视化建模

- 拖拽编辑实体：实体名、字段类型、长度、默认值、注释。
- 字段级约束标记：`PK` / `FK` / `UQ` / `AI` / `NN`，并支持 `index`。
- 实体表头、字段文本、分隔线样式均可配置（`headerStyle` / `fieldStyle` / `dividerStyle`）。

### 关系表达

- 覆盖四种关系：`one-to-one` / `one-to-many` / `many-to-one` / `many-to-many`。
- 支持自引用关系，并可指定 `parent` / `children` 属性名。
- 关系语义完整：`onDelete` / `onUpdate` / `joinTableName`，以及自定义两端基数（如 `1 : 0..N`）。
- 连线标签自动呈现基数与约束（如 `1 : 1  ON DELETE CASCADE`）。

### 导出与校验

- **一键导出 TypeORM Schema**：`toSchemaObject()` / `toSchemaString()` 输出符合 TypeORM `EntitySchema` 规范的普通对象，可直接 `new EntitySchema(obj)` 使用。
- **关系外键归属自动判定**：`one-to-many` / `one-to-one` 的外键在目标侧、`many-to-one` 的外键在源侧，`joinColumn` 自动落在持有外键的一端；`many-to-many` 生成 `joinTable` 并在反向侧补全 `inverseSide`。
- **列类型规范化**：`number → int`、`string → varchar`、`boolean → boolean`、`decimal(12,2) → precision/scale`；非字符串类型不保留 `length`。
- **内置 Schema 校验**：重名实体、重复字段、未命名字段、悬空关系、`many-to-many` 缺少 `joinTableName` 等。
- **双向关系补全**：按关系类型自动补全反向属性与 `inverseSide`，`many-to-many` 自动生成复数形式的集合属性。

### 编辑器内核能力（继承自 ice-render）

- 画布滚轮缩放、空白处拖拽平移。
- 拖拽对齐辅助线与磁吸效果。
- Undo / Redo（基于项目快照，最多 100 步）。
- 项目级保存 / 加载（`serializeProject()` / `loadProject()`）。

## 3. 界面预览

完整的 ER 模型（电商交易 + 用户权限）：

<img src="./tests/assets/overview.png" alt="ER 模型总览" />

实体字段与约束标记：

<img src="./tests/assets/fields.png" alt="实体字段与约束" />

关系语义：自引用、多对多、一对一：

<img src="./tests/assets/relations.png" alt="关系语义" />

交互式编辑器（右侧面板可直接切换到「TypeORM Schema」查看导出结果）：

<img src="./tests/assets/editor.png" alt="交互式编辑器与 TypeORM Schema" />

## 4. 快速开始

```bash
npm install
npm run build
```

可运行的示例（`tests/` 下的页面会加载同级 `dist` 与 `node_modules`，建议通过静态服务器打开）：

| 示例 | 说明 |
|---|---|
| `tests/entity-editor.html` | 交互式编辑器：实时编辑字段、创建/删除实体与关系、校验与保存加载；右侧面板含「TypeORM Schema」标签页 |
| [`examples/react`](./examples/react) | React 集成示例工程（webpack + ts-loader）：ref / hook / onChange / 受控模式 |

```bash
python3 -m http.server 8899   # 然后访问 http://localhost:8899/tests/entity-editor.html
```

## 5. 使用方式

`EntityDesigner` 是 Entity / Relation 之上的轻量应用层，负责把建模交互闭环串起来：

```js
import { ICE } from 'ice-render';
import { EntityDesigner } from 'ice-entity-designer';

const ice = new ICE().init('canvas-1');
const designer = new EntityDesigner(ice);

// 建模：创建实体与关系
const user = designer.createEntity({ entityName: 'User' });
const role = designer.createEntity({ entityName: 'Role' });
designer.createRelation({
  sourceId: user.state.id,
  targetId: role.state.id,
  relationType: 'many-to-many',
  joinTableName: 'user_roles',
});

// 导出与校验
const schema = designer.toSchemaObject(); // TypeORM Schema（对象）
const schemaText = designer.toSchemaString(); // TypeORM Schema（JSON 字符串）
const issues = designer.validate(); // 校验问题列表

// 项目存取与历史
const snapshot = designer.serializeProject();
designer.loadProject(snapshot);
designer.undo();
```

也支持更底层的组件式用法：

```js
const schema = IED.toSchemaObject(ice.childNodes);
const schemaText = IED.toSchemaString(ice.childNodes);
```

导出的对象可直接构造 TypeORM 实体：

```js
import { EntitySchema } from 'typeorm';

const schemas = designer.toSchemaObject().map((obj) => new EntitySchema(obj));
```

## 6. 在 React 中使用

包内置 React 绑定（子路径导出 `ice-entity-designer/react`），不需要自己写 ref / effect 胶水代码。

```bash
npm install ice-entity-designer ice-render react react-dom
```

```tsx
import { useRef } from 'react';
import { EntityDesignerCanvas, useEntityDesigner } from 'ice-entity-designer/react';
import type { EntityDesignerHandle } from 'ice-entity-designer/react';

// 子树内可以取到同一个 EntityDesigner 实例
function Stats() {
  const designer = useEntityDesigner();
  return <span>{designer ? `${designer.entities.length} 个实体` : '初始化中…'}</span>;
}

export default function App() {
  const ref = useRef<EntityDesignerHandle>(null);

  return (
    <>
      <button onClick={() => ref.current?.addEntity({ entityName: 'User' })}>新增实体</button>
      <button onClick={() => console.log(ref.current?.toSchemaString())}>导出 Schema</button>

      <EntityDesignerCanvas
        ref={ref}
        width={1200}
        height={800}
        defaultValue={initialProjectJson} // 可选：初始项目快照
        onChange={({ snapshot, schema }) => save(snapshot)} // 模型变更
      >
        <Stats />
      </EntityDesignerCanvas>
    </>
  );
}
```

### 6.1 取用实例的两种方式

- **`ref`**：命令式 API —— `addEntity` / `connect` / `updateEntity` / `updateRelation` / `remove` / `loadProject` / `undo` / `redo` / `toSchemaObject` / `toSchemaString` / `validate` / `serializeProject`。
- **`useEntityDesigner()`**：在 `<EntityDesignerCanvas>` 子树内直接取到底层 `EntityDesigner` 实例（如上例的 `Stats`）。

### 6.2 组件属性

| 属性 | 类型 | 说明 |
|---|---|---|
| `value` | `string` | **受控**：项目快照，变化时同步进画布（内部变更经 `onChange` 上报，带循环保护） |
| `defaultValue` | `string` | **非受控**：初始项目快照 |
| `onChange` | `(payload: { snapshot, schema }) => void` | 模型变更（增删改 / 载入 / undo / redo）后触发，`snapshot` 可直接用于自动保存 |
| `onReady` | `(handle) => void` | 实例就绪，回调里拿到命令式句柄 |
| `width` / `height` | `number` | 画布尺寸，默认 `1200 × 800` |
| `renderMode` | `'dirty-rect' \| 'full'` | 渲染模式，默认 `dirty-rect` |
| `style` / `className` | — | 作用于画布容器 |
| `children` | `ReactNode` | 渲染在上下文内，可直接 `useEntityDesigner()` |

### 6.3 受控用法

```tsx
const [project, setProject] = useState(initialJson);

<EntityDesignerCanvas
  value={project} // 外部改这个 → 同步进画布
  onChange={({ snapshot }) => setProject(snapshot)} // 内部变更上报（同值回传不会重复载入，无回环）
  width={1200}
  height={800}
/>
```

### 6.4 手动提供上下文

如果自己创建会话（例如画布在别处、只共享实例），用 `EntityDesignerProvider` 把实例交给任意子树：

```tsx
import { createDesignerSession, EntityDesignerProvider } from 'ice-entity-designer/react';

const session = createDesignerSession(canvasEl);
// <EntityDesignerProvider designer={session.designer}><Toolbar /></EntityDesignerProvider>
```

### 6.5 注意事项

- **生命周期 / StrictMode**：`<EntityDesignerCanvas>` 挂载时创建 ICE + EntityDesigner，卸载时销毁。引擎侧 `init` 幂等、`destroy` 会解绑全局监听与帧循环，因此 **React StrictMode 双挂载安全**。
- **仅客户端渲染**：组件依赖 canvas，SSR（如 Next.js）请按客户端组件使用，例如 `dynamic(() => import('./Designer'), { ssr: false })`。
- React 是**可选 peerDependency**（`^18 || ^19`），不使用 React 的项目不受影响。
- **子路径解析**：现代解析器（webpack 5 / Vite / Node ESM）走 `exports`；老版本 TypeScript（< 4.7，或 `moduleResolution: "node"`）建议改用 `node16` / `bundler`，包内另提供 `react.d.ts` 垫片以兼容旧解析器。

> 完整可运行示例（**webpack** 构建）：[`examples/react`](./examples/react)

## 7. 项目结构

```
src/
├── designer/EntityDesigner.ts     # 应用层：选择 / 增删改 / 连接 / 校验 / 历史 / 项目存取 / 变更订阅
├── er-component/
│   ├── Entity.ts                  # 实体：表头 + 字段列表 + 约束标记 + TypeORM 序列化
│   └── Relation.ts                # 关系：基数 / 箭头 / 标签语义 / 连接槽位
├── react/
│   ├── EntityDesignerCanvas.ts    # React 组件：画布 + 生命周期 + 命令式句柄
│   ├── session.ts                 # 会话封装：创建 / 销毁 ICE + EntityDesigner
│   ├── context.ts                 # 上下文与 useEntityDesigner()
│   └── index.ts                   # 子路径导出 ice-entity-designer/react
├── utils/
│   ├── serialization_util.ts      # 画布 → TypeORM Schema
│   ├── schema_validator.ts        # 轻量 Schema 校验
│   ├── camelcase_util.ts          # 命名转换
│   └── pluralize_util.ts          # 复数化（多对多属性名）
└── index.ts                       # 对外导出（核心，不含 React）
```

## 8. 开发与测试

| 命令 | 说明 |
|---|---|
| `npm start` | 监听模式构建（开发） |
| `npm run build` | 清理并完整构建（类型声明 + JS 产物） |
| `npm run types:check` | 仅做 TypeScript 类型检查 |
| `npm test` | 运行单元测试（Jest） |
| `npm run pretty` | Prettier 格式化源码 |

## 9. 环境要求与依赖

- Node.js >= 10.13.0，npm >= 6.4.1。
- 运行时依赖 `lodash`；对等依赖 `ice-render >= 1.0.4`（需自行安装）。
- React 绑定为**可选**对等依赖 `react` / `react-dom`（`^18 || ^19`），仅在使用 `ice-entity-designer/react` 时需要。
- 构建链：Rollup 2 + Babel 7 + TypeScript 4.6；测试框架：Jest。

## 10. License

[MIT licensed](./LICENSE).
