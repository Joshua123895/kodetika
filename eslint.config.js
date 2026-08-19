import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // A context file exporting its own consumer hook alongside its provider is
      // the standard React pattern; splitting them buys nothing but an extra file.
      'react-refresh/only-export-components': [
        'error',
        {
          allowExportNames: ['useAuth', 'useProgress', 'useTheme', 'useSettings'],
          // PointsViz builds KmeansViz/KnnViz through a real HOC.
          extraHOCs: ['makeViz'],
        },
      ],
    },
  },
  {
    // Tests and build scripts run in node, not the browser — without this they
    // report `process` as undefined.
    files: ['tests/**/*.{js,mjs}', 'scripts/**/*.{js,mjs}', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
])
