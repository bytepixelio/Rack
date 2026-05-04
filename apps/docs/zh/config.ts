import { defineAdditionalConfig, type DefaultTheme } from 'vitepress'

export default defineAdditionalConfig({
  description: '基于 Registry 架构的模块化项目脚手架工具',

  themeConfig: {
    nav: nav(),

    sidebar: {
      '/zh/guide/': { base: '/zh/guide/', items: sidebarGuide() },
      '/zh/reference/': { base: '/zh/reference/', items: sidebarReference() }
    }
  }
})

function nav(): DefaultTheme.NavItem[] {
  return [
    {
      text: '指南',
      link: '/zh/guide/what-is-rack',
      activeMatch: '/zh/guide/'
    },
    {
      text: '参考',
      link: '/zh/reference/rackrc',
      activeMatch: '/zh/reference/'
    }
  ]
}

function sidebarGuide(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: '简介',
      collapsed: false,
      items: [
        { text: '什么是 Rack？', link: 'what-is-rack' },
        { text: '快速开始', link: 'getting-started' }
      ]
    },
    {
      text: '核心概念',
      collapsed: false,
      items: [
        { text: '注册表', link: 'registry' },
        { text: '优先级系统', link: 'priority' },
        { text: '依赖解析规则', link: 'dependency' },
        { text: '文件合并策略', link: 'file-merge' },
        { text: '语言变体', link: 'language-variants' }
      ]
    },
    {
      text: '自定义',
      collapsed: false,
      items: [
        { text: '命名空间', link: 'namespace' },
        { text: '认证', link: 'authentication' }
      ]
    },
    {
      text: '模板',
      collapsed: false,
      items: [
        { text: 'Preset 模板', link: 'preset' },
        { text: '自定义 Registry', link: 'create-registry' }
      ]
    },
    {
      text: 'Registry 服务',
      collapsed: false,
      items: [
        { text: '部署概述', link: 'registry-server/overview' },
        { text: '配置指南', link: 'registry-server/configuration' },
        { text: '部署方式', link: 'registry-server/methods' },
        { text: '发布 Registry', link: 'registry-server/publishing' },
        { text: '运维监控', link: 'registry-server/operations' }
      ]
    }
  ]
}

function sidebarReference(): DefaultTheme.SidebarItem[] {
  return [
    {
      items: [
        { text: '配置文件', link: 'rackrc' },
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
