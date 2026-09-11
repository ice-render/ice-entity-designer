module.exports = {
  testEnvironment: 'node',
  // 只跑单测：不限制 testMatch 时，jest 默认规则会把 e2e/*.spec.ts（Playwright 用例）也当成 jest 用例而报错
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': 'babel-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  // 覆盖率统计**全量 src**（不设该项时只统计「被测试触达的文件」，数字会虚高）
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  coverageReporters: ['text-summary', 'lcov'],
  // 门槛是「只允许往上调」的棘轮：按 2026-09-11 实测基线（语句 90.8% / 分支 76.5% /
  // 函数 87.2% / 行 91.0%）向下留出余量。覆盖率下降即失败（例如新增模块却不写测试）。
  // 覆盖率提升后请同步上调这些数字（不要下调）。
  coverageThreshold: {
    global: {
      statements: 88,
      branches: 74,
      functions: 85,
      lines: 88,
    },
  },
};
