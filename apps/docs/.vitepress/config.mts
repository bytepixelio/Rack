import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'RackJS',

  rewrites: {
    'en/:rest*': ':rest*'
  },

  cleanUrls: true,
  metaChunk: true,

  head: [
    ['link', { rel: 'icon', href: 'https://fav.farm/%F0%9F%8F%97' }],
    ['meta', { name: 'theme-color', content: '#5f67ee' }]
  ],

  themeConfig: {
    siteTitle: false,

    logo: { dark: '/logo-dark.png', light: '/logo-light.png' },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/bytepixelio/Rack' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025-present RackJS'
    }
  },

  locales: {
    root: { label: 'English', lang: 'en-US', dir: 'ltr' },
    zh: { label: '简体中文', lang: 'zh-Hans', dir: 'ltr' }
  }
})
