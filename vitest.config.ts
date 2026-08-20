import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { 'server-only': resolve(__dirname, 'tests/stubs/server-only.ts') },
  },
})
