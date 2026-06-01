import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import sveltePlugin from 'eslint-plugin-svelte';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
	// Global ignores (replaces ignorePatterns)
	{
		ignores: [
			'*.cjs',
			'.svelte-kit/**',
			'dist/**',
			'build/**',
			'node_modules/**'
		]
	},

	// 1. Recommended settings for JS and TS via typescript-eslint
	...tsPlugin.configs['flat/recommended'],

	// 2. Recommended settings for Svelte
	...sveltePlugin.configs['flat/recommended'],

	// 3. Global settings (e.g. browser, node)
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},

	// 4. Configure TS and Svelte.ts files to use TypeScript parser
	{
		files: ['**/*.ts', '**/*.tsx', '**/*.svelte.ts'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				sourceType: 'module',
				ecmaVersion: 2020,
				extraFileExtensions: ['.svelte']
			}
		}
	},

	// 5. Configure Svelte files to use the TypeScript parser
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
				extraFileExtensions: ['.svelte']
			}
		},
		rules: {
			'svelte/html-self-closing': ['error', 'always'],
			'svelte/valid-compile': 'off'
		}
	},

	// 6. Custom Rules
	{
		rules: {
			semi: ['error', 'always']
		}
	},

	// 7. Prettier config (disables formatting rules)
	prettierConfig
];
