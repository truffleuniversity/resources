import * as colors from './src/utils/colors'

export default {
  title: 'Truffle University',
  base: '/docs',
  ignore: ['**/blog/**', 'readme.md'],
  menu: ['Introduction', 'Glossary', 'Projects', 'Resources'],
  themeConfig: {
    colors: {
      primary: colors.primary,
    },
  },
}
