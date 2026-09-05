import typescriptEslint from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['node_modules/**', 'dist/**', '.test-dist/**', 'coverage/**'] },
  ...typescriptEslint.configs['flat/recommended'],
  prettier,
];
