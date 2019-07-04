import * as colors from './src/utils/colors'

export default {
  title: 'Truffle University',
  base: '/docs',
  ignore: ['**/blog/**', 'readme.md'],
  menu: ['About', 'Introductory', 'Resources', 'Services', 'Glossary'],
  themeConfig: {
    colors: {
      primary: colors.primary,
    },
  },
}
