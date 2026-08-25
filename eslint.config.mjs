import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const config = defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'dist/**',
      'next-env.d.ts',
      'public/**/*.min.*',
      'backups/**',
      'supabase/.temp/**',
      '**/*.disabled.*',
  ]),
  {
    rules: {
      // Existing prototype routes still contain broad integration payloads.
      // Keep this debt visible without blocking unrelated correctness checks.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Next 16's flat preset adds this React 19 advisory rule. Existing effects
      // are behaviorally covered and are outside this security-only upgrade.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])

export default config
