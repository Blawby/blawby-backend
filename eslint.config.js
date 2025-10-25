import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import stylistic from '@stylistic/eslint-plugin';

export default [
  {
    files: ['src/**/*.{js,ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      import: importPlugin,
      '@stylistic': stylistic,
    },
    rules: {
      // ESLint formatting rules only (oxlint handles linting)
      // TypeScript rules (minimal - oxlint handles most linting)
      '@typescript-eslint/no-unused-vars': 'off', // oxlint handles this
      '@typescript-eslint/no-explicit-any': 'off', // oxlint handles this
      '@typescript-eslint/prefer-const': 'off', // oxlint handles this

      // @stylistic/eslint-plugin rules (comprehensive formatting)
      ...stylistic.configs['recommended'].rules,

      // Custom stylistic overrides
      '@stylistic/indent': ['error', 2, {
        ignoredNodes: ['LogicalExpression', 'SwitchCase']
      }],
      '@stylistic/indent-binary-ops': 'off', // Disable to preserve logical operator alignment
      '@stylistic/operator-linebreak': ['error', 'before'],

      '@stylistic/array-bracket-newline': ['error', 'consistent'],
      '@stylistic/array-bracket-spacing': ['error', 'never'],
      '@stylistic/array-element-newline': ['error', 'consistent'],
      '@stylistic/arrow-parens': ['error', 'always', { requireForBlockBody: true }],
      '@stylistic/arrow-spacing': 'off',
      '@stylistic/block-spacing': ['error', 'always'],
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
      '@stylistic/comma-dangle': ['error', {
        arrays: 'always-multiline',
        exports: 'always-multiline',
        functions: 'always-multiline',
        imports: 'always-multiline',
        objects: 'always-multiline',
      }],
      '@stylistic/comma-spacing': ['error', { after: true, before: false }],
      '@stylistic/computed-property-spacing': ['error', 'never'],
      '@stylistic/function-call-argument-newline': ['error', 'consistent'],
      '@stylistic/function-paren-newline': ['error', 'consistent'],
      '@stylistic/function-call-spacing': ['error', 'never'],
      '@stylistic/space-before-function-paren': ['error', {
        anonymous: 'always',
        named: 'never',
        asyncArrow: 'always'
      }],
      '@stylistic/implicit-arrow-linebreak': ['error', 'beside'],
      '@stylistic/key-spacing': ['error', { afterColon: true, beforeColon: false }],
      '@stylistic/keyword-spacing': ['error', { after: true, before: true }],
      '@stylistic/max-len': ['error', { code: 120, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true }],
      '@stylistic/no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1, maxBOF: 0 }],
      '@stylistic/no-trailing-spaces': ['error', { ignoreComments: false, skipBlankLines: false }],
      '@stylistic/object-curly-newline': ['error', {
        ExportDeclaration: { consistent: true, minProperties: 4 },
        ImportDeclaration: { consistent: true, minProperties: 6 },
        ObjectExpression: { consistent: true, minProperties: 4 },
        ObjectPattern: { consistent: true, minProperties: 4 },
      }],
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/object-property-newline': ['error', { allowAllPropertiesOnSameLine: true }],
      '@stylistic/padded-blocks': ['error', { blocks: 'never', classes: 'never', switches: 'never' }, { allowSingleLineBlocks: true }],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/space-before-blocks': 'error',
      '@stylistic/space-in-parens': ['error', 'never'],
      '@stylistic/space-infix-ops': 'error',
      '@stylistic/spaced-comment': ['error', 'always', {
        block: { balanced: true, exceptions: ['-', '+'], markers: ['=', '!', ':', '::'] },
        line: { exceptions: ['-', '+'], markers: ['=', '!', '/'] },
      }],

      // Import/Export formatting
      'import/order': ['error', {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        alphabetize: { order: 'asc', caseInsensitive: true }
      }],
      'import/newline-after-import': 'error',
      'import/no-duplicates': 'error',
      'import/first': 'error',
      'import/no-unresolved': 'off', // TypeScript handles this

      // TypeScript specific formatting
      '@stylistic/type-annotation-spacing': ['error', {
        before: false,
        after: true,
        overrides: {
          arrow: { before: true, after: true }
        }
      }],
      '@stylistic/member-delimiter-style': ['error', {
        multiline: { delimiter: 'semi', requireLast: true },
        singleline: { delimiter: 'semi', requireLast: false }
      }],
    },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: {
      // Allow console.log in scripts
      'no-console': 'off',
    },
  },
];
