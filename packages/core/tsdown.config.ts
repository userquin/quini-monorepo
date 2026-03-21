import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  clean: true,
  dts: {
    build: true,
  },
  failOnWarn: true,
  publint: true,
  // publint: 'ci-only',
  attw: {
    enabled: true,
    // enabled: 'ci-only',
    ignoreRules: ['cjs-resolves-to-esm'],
  },
})
