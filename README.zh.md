# Web Browser Plugin

一款 **Hermes Desktop 插件**，在 Hermes 中嵌入功能完整的浏览器面板，无需切换窗口即可直接浏览网页。

[English](README.md)

![Hermes Desktop Web Browser Plugin](screenshot.png)

## 功能

- **嵌入式 iframe 浏览器** -- 在 Hermes 侧栏中渲染网页
- **后退/前进导航** -- 维护浏览历史栈，支持前进后退
- **刷新** -- 一键重新加载当前页面
- **收藏夹** -- 下拉菜单管理，添加/删除收藏页面，数据持久化
- **键盘快捷键** -- `Ctrl+Shift+B` 切换面板显示
- **状态栏图标** -- 点击地球图标快速显示/隐藏浏览器面板

## 安装

### 前提条件

- [Hermes Agent](https://hermes-agent.nousresearch.com) Desktop 版本（插件在 CLI 模式下不可用）

### 安装步骤

**方式 A -- 让 Hermes 帮你安装（推荐）**

直接复制下面这行，发给你的 Hermes Agent 即可：

```
帮我安装这个 Hermes Desktop 插件：https://github.com/AWhileLater/web-browser-plugin
```

一句话搞定，Hermes 会自动克隆仓库并配置好。

**方式 B -- 手动安装**

```bash
git clone https://github.com/AWhileLater/web-browser-plugin.git
cp -r web-browser-plugin ~/.hermes/desktop-plugins/web-browser-plugin
```

两种方式完成后，在命令面板（`Ctrl+K`）中运行 **Reload desktop plugins** 重新加载即可。

## 使用说明

1. 点击 Hermes Desktop 状态栏中的地球图标，或按下 `Ctrl+Shift+B` 打开浏览器面板
2. 在地址栏输入 URL 并回车（或点击 Go 按钮）
3. 使用工具栏按钮进行后退/前进/刷新操作
4. 点击星标将当前页面加入收藏夹

## 项目结构

```
web-browser-plugin/
├── plugin.js         # 插件主文件 -- 纯 ESM JavaScript
├── README.md         # 英文文档
├── README.zh.md      # 中文文档（本文件）
├── LICENSE           # MIT 许可证
└── screenshot.png    # 运行截图
```

## 开发

插件是纯 ESM JavaScript，无需构建步骤。修改 `plugin.js` 后保存即热重载。

### 约定

- 插件 ID: `web-browser-plugin`
- 导出格式: `export default { id, name, register(ctx) }`
- 依赖仅限 `@hermes/plugin-sdk` 和 `react`

## 许可证

MIT
