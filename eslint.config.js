import js from '@eslint/js'

export default [
  { ignores: ['coverage', 'dist'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        console: 'readonly',
        describe: 'readonly',
        it: 'readonly'
      },
      sourceType: 'module'
    }
  }
]
