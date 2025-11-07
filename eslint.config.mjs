// eslint.config.mjs — ESLint 9 flat config using eslint-plugin-next

import nextPlugin from 'eslint-plugin-next';

export default [
  // Replace .eslintignore
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'dist/**',
      'public/**/*.min.*',
    ],
  },

  // Use Next's "core-web-vitals" preset from the plugin
  nextPlugin.configs['core-web-vitals'],
];
