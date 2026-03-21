import { defineConfig } from 'tsdown'
import { alias } from '../../alias.ts'

export default defineConfig({
  entry: ['src/index.ts'],
  clean: true,
  dts: {
    build: true,
  },
  alias,
  failOnWarn: true,
  publint: true,
  // publint: 'ci-only',
  attw: {
    enabled: true,
    // enabled: 'ci-only',
    ignoreRules: ['cjs-resolves-to-esm'],
  },
})
