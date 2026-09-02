'use strict'

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'build/release/**',
      'src/assets/js/**',
      'src/assets/css/**',
      'src/hostping.js',
      'pepflashplayer*'
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...require('globals').node,
        window: 'readonly',
        document: 'readonly',
        Image: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        URL: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'eqeqeq': ['warn', 'smart'],
      'no-eval': 'error',
      'no-implied-eval': 'error'
    }
  }
]
