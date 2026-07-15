import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  prettier,
  {
    // src/ est agnostique du rendu : aucun global navigateur ni Node autorisé.
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
  },
  {
    files: ['render/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.browser },
  },
  {
    files: ['test/**/*.js', 'eslint.config.js', 'server.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.node },
  },
];
