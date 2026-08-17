import { FlatCompat } from '@eslint/eslintrc'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory: currentDirectory })

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'dist/**',
      'next-env.d.ts',
      'public/**/*.min.*',
      'backups/**',
      'supabase/.temp/**',
      '**/*.disabled.*',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Existing prototype routes still contain broad integration payloads.
      // Keep this debt visible without blocking unrelated correctness checks.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]

export default config
