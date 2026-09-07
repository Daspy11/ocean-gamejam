import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'placeholder'] },
  tseslint.configs.recommended,
  { rules: { 'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }] } },
  {
    files: ['src/game/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['phaser', 'phaser/**', '../**'],
              message: 'src/game is pure simulation: no Phaser, no imports from outside src/game.',
            },
          ],
        },
      ],
    },
  },
  prettier,
)
