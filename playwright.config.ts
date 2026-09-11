import { defineConfig } from '@playwright/test';

/**
 * ice-entity-designer 端到端回归配置。
 *
 * 覆盖 tests/entity-editor.html 这个完整编辑器页面（它是应用层唯一的「真·用户路径」）：
 * 工具栏 15 个按钮、画布交互（命中/拖拽/连线/滚轮缩放/平移）、React+antd 实体面板、
 * 以及 console/pageerror 零报错。
 *
 * 前置：npm run build（示例页加载的是 ../dist/index.umd.js，内核已打进产物）
 * 运行：npm run test:e2e
 *
 * 与内核仓（ice-render）的 playwright.config.ts 保持同一套约定；
 * 端口错开（内核用 8090，这里用 8091），两个仓可同时跑。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: [['list']],
  webServer: {
    command: 'npx http-server . -p 8091 -c-1 --silent',
    port: 8091,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://localhost:8091',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
});
