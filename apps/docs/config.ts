import { defineAdditionalConfig, type DefaultTheme } from 'vitepress'

export default defineAdditionalConfig({
  description:
    'A modular project scaffolding tool based on Registry architecture',

  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    [
      'link',
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }
    ],
    [
      'link',
      {
        href: 'https://fonts.googleapis.com/css2?family=Comfortaa:wght@600&display=swap',
        rel: 'stylesheet'
      }
    ]
  ],

  themeConfig: {
    nav: nav(),

    sidebar: {
      '/guide/': { base: '/guide/', items: sidebarGuide() },
      '/reference/': { base: '/reference/', items: sidebarReference() }
    }
  }
})

function nav(): DefaultTheme.NavItem[] {
  return [
    { text: 'Guide', link: '/guide/what-is-rack', activeMatch: '/guide/' },
    { text: 'Reference', link: '/reference/rackrc', activeMatch: '/reference/' }
  ]
}

function sidebarGuide(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: 'Overview',
      collapsed: false,
      items: [
        { text: 'What Is Rack?', link: 'what-is-rack' },
        { text: 'Getting Started', link: 'getting-started' }
      ]
    },
    {
      text: 'Core Concepts',
      collapsed: false,
      items: [
        { text: 'Registries', link: 'registry' },
        { text: 'Priority System', link: 'priority' },
        { text: 'Dependency Resolution', link: 'dependency' },
        { text: 'File Merge Strategy', link: 'file-merge' },
        { text: 'Language Variants', link: 'language-variants' }
      ]
    },
    {
      text: 'Customization',
      collapsed: false,
      items: [
        { text: 'Namespaces', link: 'namespace' },
        { text: 'Authentication', link: 'authentication' }
      ]
    },
    {
      text: 'Templates',
      collapsed: false,
      items: [
        { text: 'Preset Templates', link: 'preset' },
        { text: 'Create a Registry', link: 'create-registry' }
      ]
    },
    {
      text: 'Registry Server',
      collapsed: false,
      items: [
        { text: 'Overview', link: 'registry-server/overview' },
        { text: 'Configuration', link: 'registry-server/configuration' },
        { text: 'Deployment Methods', link: 'registry-server/methods' },
        { text: 'Publish Registry', link: 'registry-server/publishing' },
        { text: 'Operations', link: 'registry-server/operations' }
      ]
    }
  ]
}

function sidebarReference(): DefaultTheme.SidebarItem[] {
  return [
    {
      items: [
        { text: 'Configuration File', link: 'rackrc' },
        {
          text: 'Schema',
          items: [
            { text: 'rack.json', link: 'schema/rack' },
            { text: 'preset.json', link: 'schema/preset' },
            { text: 'registry-item.json', link: 'schema/registry-item' }
          ]
        },
        {
          text: 'CLI',
          items: [
            { text: 'init', link: 'cli#rk-init' },
            { text: 'add', link: 'cli#rk-add' },
            { text: 'list', link: 'cli#rk-list' },
            { text: 'config', link: 'cli#rk-config' },
            { text: 'doctor', link: 'cli#rk-doctor' },
            { text: 'version', link: 'cli#rk-version' }
          ]
        }
      ]
    }
  ]
}
