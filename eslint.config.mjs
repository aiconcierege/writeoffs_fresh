import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'dist/**',
      'public/**/*.min.*',
      'backups/**',
      '**/*.disabled.*',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      // Existing prototype routes still contain broad integration payloads.
      // Keep this debt visible without blocking unrelated correctness checks.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]

export default config
