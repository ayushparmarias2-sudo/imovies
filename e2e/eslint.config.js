const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules', 'test-results'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node, document: 'readonly', window: 'readonly', getComputedStyle: 'readonly' } }, // browser globals: used inside page.evaluate()
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }], eqeqeq: ['error', 'always'] },
  },
];
