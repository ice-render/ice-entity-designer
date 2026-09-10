# ice-entity-designer · React 示例（webpack）

演示如何在 React 中使用 [ice-entity-designer](../../README.md)：挂载即初始化、卸载即销毁，通过 `ref` 调用命令式 API、通过 `useEntityDesigner()` 在子树内共享同一个实例、通过 `onChange` 拿到项目快照与 TypeORM Schema。

## 运行

```bash
npm install
npm run start   # http://localhost:8080
```

生产构建：

```bash
npm run build   # 产物在 dist/
```

## 依赖说明

本示例的依赖通过 `file:` 指向仓库内与同级的包（方便工作区内联调）：

```json
"ice-entity-designer": "file:../..",
"ice-render": "file:../../../ice-render"
```

在真实项目里换成发布版本即可：

```json
"ice-entity-designer": "^0.0.16",
"ice-render": ">=1.0.4"
```

## 目录

```
examples/react/
├── public/index.html      # HtmlWebpackPlugin 模板
├── src/App.tsx            # 示例：工具条 + 画布 + Schema 预览
├── src/index.tsx          # 入口
├── tsconfig.json
└── webpack.config.js
```

## 关键点

- 构建工具是 **webpack**（`webpack` + `webpack-cli` + `webpack-dev-server` + `ts-loader` + `html-webpack-plugin`）。
- 绑定层入口是子路径 `ice-entity-designer/react`，无需自己写 ref / effect 胶水。
- 画布尺寸由 `width` / `height` 指定；`children` 会渲染在上下文内部，可直接 `useEntityDesigner()`。

## 演示的三种用法

- **命令式**：通过 `ref` 调用 `addEntity` / `undo` / `redo` / `toSchemaObject` / `validate`。
- **共享实例**：`useEntityDesigner()` 在子树内取到同一个 `EntityDesigner`（示例里的 `<Stats />`）。
- **非受控**：`<EntityDesignerCanvas defaultValue={json} onChange={...} />`。

受控模式（把项目快照交给 React state 管理）也很简单：

```tsx
const [project, setProject] = useState(initialJson);

<EntityDesignerCanvas
  value={project} // 外部改这个就同步进画布
  onChange={({ snapshot }) => setProject(snapshot)} // 内部变更上报（同值回传不会重复载入）
/>
```

## 关于 tsconfig

- `"types": []` 是刻意设置的：避免从上层 `node_modules` 自动引入不兼容的 `@types/*`（本仓库根目录的 `@types/node` 等需要更高版本 TypeScript，会直接报语法错误）。
- 若你的项目 TypeScript ≥ 4.7，建议把 `moduleResolution` 改为 `"bundler"` 或 `"node16"`，由 `exports` 解析 `ice-entity-designer/react` 的类型；旧版解析器可依赖包内的 `react.d.ts` 垫片。
