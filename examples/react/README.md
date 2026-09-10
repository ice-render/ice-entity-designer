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
