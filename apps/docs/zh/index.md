---
layout: home
---

<style>
.home-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 96px 32px;
  text-align: center;
}

.hero .logo {
  margin: 0;
  color: #000;
  font-size: 20px;
  line-height: 1.1;
}

@media (max-width: 768px) {
  .hero .logo {
    font-size: 12px;
  }
}

.dark .logo {
  background-image: -webkit-linear-gradient(317deg, #ffc517 25%, #c00 75%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero p {
  margin: 10px 0 60px;
  font-size: 1.25rem;
  color: var(--vp-c-text-2);
}

@media (max-width: 768px) {
  .hero p {
    font-size: 12px;
  }
}

[lang=en-US] .hero p {
  font-family: 'Comfortaa', cursive;
}

[lang=zh-Hans] .hero p {
  font-family: PingFang SC, sans-serif;
}

.hero a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 1rem;
  padding: 10px 20px;
  border-radius: 8px;
  color: var(--vp-button-brand-text);
  background-color: var(--vp-button-brand-bg);
  text-decoration: none;
  transition: background-color 0.5s;
  
}

.hero a:hover {
  color: var(--vp-button-brand-text);
  background-color: var(--vp-button-brand-hover-bg);
}

.highlights {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  max-width: 972px;
  margin: 0 auto;
  padding: 0 32px 72px;
  color: var(--vp-c-text-2);
}

.highlight {
  padding: 28px 36px;
  border-radius: 8px;
  flex: 0 48%;
  font-size: 14px;
  font-weight: 500;
}

@media (max-width: 768px) {
  .highlight {
    padding: 28px 12px;
    flex: 0 100%;
  }
}

.highlight h2 {
  font-size: 18px;
  margin: 0;
  padding-top: 0px;
  border-top: none;
  line-height: 24px;
  letter-spacing: -.4px;
  color: var(--vp-c-text-1);
  margin-bottom: .75em;
}

[lang=en-US] .highlight h2 {
  font-family: 'Comfortaa', cursive;
}

[lang=zh-Hans] .highlight h2 {
  font-family: PingFang SC, sans-serif;
}

.highlight p {
  margin: 0;
  font-size: 14px;
}

[lang=en-US] .highlight p {
  font-family: 'Comfortaa', cursive;
}

[lang=zh-Hans] .highlight p {
  font-family: PingFang SC, sans-serif;
}
</style>

<div class="home-container">
  <section class="hero">
    <pre class="logo">
██████╗  █████╗  ██████╗██╗  ██╗     ██╗███████╗
██╔══██╗██╔══██╗██╔════╝██║ ██╔╝     ██║██╔════╝
██████╔╝███████║██║     █████╔╝      ██║███████╗
██╔══██╗██╔══██║██║     ██╔═██╗ ██   ██║╚════██║
██║  ██║██║  ██║╚██████╗██║  ██╗╚█████╔╝███████║
╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝ ╚════╝ ╚══════╝</pre>
    <p>基于 Registry 架构的模块化项目脚手架工具</p>
    <a href="/zh/guide/getting-started" class="vp-button vp-button--primary">
      <span>快速开始</span>
      <svg class="icon" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24">
        <path fill="currentColor" d="M13.025 1l-2.847 2.828 6.176 6.176h-16.354v3.992h16.354l-6.176 6.176 2.847 2.828 10.975-11z"></path>
      </svg>
    </a>
  </section>
  <section class="highlights">
    <div class="highlight">
      <h2>🧩 模块</h2>
      <p>像搭乐高一样构建你的技术栈</p>
      <p>自由组合、复用，每个模块都独立清晰</p>
    </div>
    <div class="highlight">
      <h2>⚙️ 拓展</h2>
      <p>随时新增功能</p>
      <p>无需重建，无负担，顺滑升级</p>
    </div>
    <div class="highlight">
      <h2>🔗 依赖</h2>
      <p>自动处理依赖关系</p>
      <p>告别版本冲突与手动修复</p>
    </div>
    <div class="highlight">
      <h2>🏢 仓库</h2>
      <p>团队共享私有 Registry</p>
      <p>保持每个项目配置一致、同步、可控</p>
    </div>
  </section>
</div>
