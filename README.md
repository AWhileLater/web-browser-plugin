# Web Browser Plugin

A **Hermes Desktop Plugin** that embeds a full-featured browser pane into your workspace. Browse the web directly inside Hermes -- no window switching required.

[中文文档](README.zh.md)

![Hermes Desktop Web Browser Plugin](screenshot.png)

## Features

- **Embedded iframe browser** -- render web pages in a Hermes side panel
- **Back/Forward navigation** -- history stack with prev/next buttons
- **Refresh** -- one-click page reload
- **Bookmarks** -- drop-down menu with add/remove, persisted via `ctx.storage`
- **Keyboard shortcut** -- `Ctrl+Shift+B` to toggle the panel
- **Status bar toggle** -- globe icon to show/hide the browser pane

## Installation

### Prerequisites

- [Hermes Agent](https://hermes-agent.nousresearch.com) Desktop (the plugin does not work in CLI mode)

### Steps

**Option A -- Let Hermes install it (recommended)**

Copy the line below and paste it to your Hermes Agent:

```
Install the Hermes Desktop Plugin from https://github.com/AWhileLater/web-browser-plugin
```

That's it -- Hermes will clone the repository and set everything up automatically.

**Option B -- Manual install**

```bash
git clone https://github.com/AWhileLater/web-browser-plugin.git
cp -r web-browser-plugin ~/.hermes/desktop-plugins/web-browser-plugin
```

After either method, reload plugins by running **Reload desktop plugins** from the command palette (`Ctrl+K`).

## Usage

1. Click the globe icon in the Hermes Desktop status bar, or press `Ctrl+Shift+B` to open the browser panel
2. Type a URL in the address bar and press Enter (or click the Go button)
3. Use the toolbar buttons for back/forward/refresh
4. Click the star to bookmark the current page

## Project Structure

```
web-browser-plugin/
├── plugin.js         # Main plugin file -- plain ESM JavaScript
├── README.md         # This file (English)
├── README.zh.md      # Chinese translation
├── LICENSE           # MIT License
└── screenshot.png    # Screenshot in action
```

## Development

The plugin is plain ESM JavaScript -- no build step. Save changes to `plugin.js` and it hot-reloads automatically.

### Conventions

- Plugin ID: `web-browser-plugin`
- Export signature: `export default { id, name, register(ctx) }`
- Dependencies limited to `@hermes/plugin-sdk` and `react`

## License

MIT
