import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  // Global ignores
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**', '*.js'],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // Prettier — disables formatting rules that conflict
  eslintConfigPrettier,

  // Main process + preload (Node environment)
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Renderer (browser + React)
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      // Only use classic react-hooks rules (v7 recommended includes React Compiler rules)
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/react-in-jsx-scope': 'off', // Not needed with React 17+ JSX transform
      'react/prop-types': 'off', // Using TypeScript for prop validation
    },
  },

  // Vite / build config files
  {
    files: ['electron.vite.config.ts', 'vite.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Test files
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', '**/*.bench.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },

  // Project-wide rule overrides
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-require-imports': 'off', // node-pty and native addons use require
    },
  },
);
