/**
 * Web Browser — 多 Tab 浏览器插件（基于 webview）
 *
 * 功能：
 * - 多 Tab 支持（新建/关闭/切换）
 * - target="_blank" 链接自动在新 Tab 打开
 * - 地址栏、前进/后退、刷新/停止、收藏夹
 * - 页面标题显示
 */

import { jsx } from 'react/jsx-runtime'
import { useState, useRef, useCallback, useEffect } from 'react'
import { icons, KEYBINDS_AREA, atom } from '@hermes/plugin-sdk'

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
const IS_LOCAL = /^localhost\b|^127\.|^10\.|^192\.168\.|^0\.|^::1\b/i

function normalizeUrl(input) {
  const s = (input || '').trim()
  if (!s) return ''
  if (HAS_SCHEME.test(s)) return s
  if (IS_LOCAL.test(s)) return 'http://' + s
  return 'https://' + s
}

function hostname(url) {
  try { return new URL(url).hostname } catch { return url }
}

// Tab 唯一 ID 计数器
let tabIdCounter = 0
function nextTabId() { return ++tabIdCounter }

// 新 Tab 拦截脚本
const NEW_TAB_INTERCEPT_SCRIPT = `
(function() {
  if (window.__annotatorIntercepted) return;
  window.__annotatorIntercepted = true;
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (a && a.target === '_blank' && a.href) {
      e.preventDefault();
      e.stopPropagation();
      document.documentElement.setAttribute('data-pending-new-tab', a.href);
    }
  }, true);
  window.open = function(url) {
    if (url) {
      document.documentElement.setAttribute('data-pending-new-tab', url);
    }
    return null;
  };
})()
`

// ---------------------------------------------------------------------------
// 收藏夹下拉菜单
// ---------------------------------------------------------------------------

function BookmarkMenu({ open, onClose, bookmarks, onAdd, onRemove, onOpen }) {
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose()
    }
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open, onClose])

  if (!open) return null

  return jsx('div', {
    ref: menuRef,
    style: {
      position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: 4,
      width: 256, borderRadius: 6, border: '1px solid #3a3a4a',
      backgroundColor: '#1e1e2e', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', opacity: 1,
    },
    children: [
      jsx('button', {
        type: 'button', onClick: onAdd,
        style: {
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '8px 12px', fontSize: 12, color: '#e0e0e0',
          backgroundColor: 'transparent', border: 'none', cursor: 'pointer', opacity: 1,
        },
        children: [
          jsx('svg', {
            xmlns: 'http://www.w3.org/2000/svg', width: 14, height: 14,
            viewBox: '0 0 24 24', fill: 'none', stroke: '#facc15',
            strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
            style: { flexShrink: 0 },
            children: jsx('path', {
              d: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z'
            })
          }),
          jsx('span', { children: 'Add current page' })
        ]
      }),
      bookmarks.length > 0 && jsx('div', { style: { borderTop: '1px solid #3a3a4a' } }),
      bookmarks.length > 0 && jsx('div', {
        style: { maxHeight: 192, overflowY: 'auto', opacity: 1 },
        children: bookmarks.map((bm) =>
          jsx('div', {
            key: bm.url,
            style: {
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', fontSize: 12, color: '#e0e0e0',
              backgroundColor: 'transparent', cursor: 'pointer', opacity: 1,
            },
            children: [
              jsx('span', {
                onClick: () => { onOpen(bm.url); onClose() },
                style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                children: bm.url
              }),
              jsx('span', {
                onClick: (e) => { e.stopPropagation(); onRemove(bm.url) },
                style: { paddingLeft: 4, cursor: 'pointer', flexShrink: 0 },
                children: jsx(icons.X, { size: 12, stroke: 2 })
              })
            ]
          })
        )
      })
    ]
  })
}

// ---------------------------------------------------------------------------
// 单个 Tab 的 Webview
// ---------------------------------------------------------------------------

function TabWebview({ tab, isActive, onNavigate, onTitleChange, onNewTabRequest, reinjectFlag }) {
  const webviewRef = useRef(null)

  // 通过 DOM 事件监听新窗口请求
  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return
    const handler = (e) => {
      console.log('[browser] new-window event:', e?.url)
      const url = e?.url
      if (url) {
        e.preventDefault()
        onNewTabRequest(url)
      }
    }
    wv.addEventListener('new-window', handler)
    return () => wv.removeEventListener('new-window', handler)
  }, [onNewTabRequest])

  // 每次页面加载后注入拦截脚本
  const injectInterceptScript = useCallback(() => {
    const wv = webviewRef.current
    if (!wv) return
    try {
      wv.executeJavaScript(`
        (function() {
          if (window.__annotatorIntercepted) return { ready: true, already: true };
          window.__annotatorIntercepted = true;

          // 视觉确认：注入一个小标记
          var badge = document.createElement('div');
          badge.id = '__browser_injected';
          badge.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:999999;padding:4px 10px;background:rgba(0,180,0,0.8);color:#fff;font:11px sans-serif;border-radius:4px;';
          badge.textContent = '✓ tab-monitor active';
          document.body.appendChild(badge);

          // 拦截 target="_blank" 链接
          document.addEventListener('click', function(e) {
            var a = e.target.closest('a');
            if (a && a.target === '_blank' && a.href) {
              e.preventDefault();
              e.stopPropagation();
              document.documentElement.setAttribute('data-pending-new-tab', a.href);
              // 闪烁反馈（调试用）
              badge.style.background = 'rgba(200,0,0,0.8)';
              badge.textContent = '⏎ ' + a.href;
              setTimeout(function(){ badge.style.background = 'rgba(0,180,0,0.8)'; badge.textContent = '✓ tab-monitor active'; }, 1500);
            }
          }, true);

          // 拦截 window.open
          window.open = function(url) {
            if (url) document.documentElement.setAttribute('data-pending-new-tab', url);
            return null;
          };

          return { ready: true, url: location.href };
        })()
      `).then((res) => {
        console.log('[browser] inject result:', JSON.stringify(res))
      }).catch((err) => {
        console.error('[browser] inject error:', err.message)
      })
    } catch (e) {
      console.error('[browser] inject exception:', e)
    }
  }, [])

  // reinjectFlag 变化时重新注入（手动按钮触发）
  useEffect(() => {
    if (reinjectFlag > 0) injectInterceptScript()
  }, [reinjectFlag, injectInterceptScript])

  // URL 变化时自动注入（替代不可靠的 webview 事件）
  useEffect(() => {
    if (!tab.url || tab.url === 'about:blank' || tab.url === '') return
    // 页面加载需要时间，延迟 1.5 秒后注入
    const timer = setTimeout(() => {
      injectInterceptScript()
    }, 1500)
    return () => clearTimeout(timer)
  }, [tab.url, injectInterceptScript])

  // Tab 变为活跃时重新注入
  useEffect(() => {
    if (!isActive) return
    const timer = setTimeout(() => {
      injectInterceptScript()
    }, 1500)
    return () => clearTimeout(timer)
  }, [isActive, injectInterceptScript])

  // 轮询新 Tab 请求
  const pollNewTabRequest = useCallback(() => {
    const wv = webviewRef.current
    if (!wv) return
    try {
      wv.executeJavaScript(`
        (function() {
          var url = document.documentElement.getAttribute('data-pending-new-tab');
          if (url) {
            document.documentElement.removeAttribute('data-pending-new-tab');
            return url;
          }
          return null;
        })()
      `).then((url) => {
        if (url) {
          console.log('[browser] poll detected new tab:', url)
          onNewTabRequest(url)
        }
      }).catch(() => {})
    } catch (e) {}
  }, [onNewTabRequest])

  // 启动轮询
  useEffect(() => {
    if (!isActive) return
    const timer = setInterval(pollNewTabRequest, 500)
    return () => clearInterval(timer)
  }, [isActive, pollNewTabRequest])

  // webview 事件
  const handleDidStartLoading = useCallback(() => {}, [])
  const handleDidStopLoading = useCallback(() => {
    injectInterceptScript()
  }, [injectInterceptScript])
  const handleDidNavigate = useCallback((e) => {
    const url = e?.detail?.url
    if (url) onNavigate(tab.id, url)
  }, [tab.id, onNavigate])
  const handlePageTitleUpdated = useCallback((e) => {
    const title = e?.detail?.title || ''
    onTitleChange(tab.id, title)
  }, [tab.id, onTitleChange])

  return jsx('div', {
    className: 'flex min-h-0 flex-1 flex-col' + (isActive ? '' : ' hidden'),
    children: jsx('webview', {
      ref: webviewRef,
      src: tab.url,
      className: 'w-full flex-1 border-none',
      style: { background: 'white' },
      autosize: 'on',
      partition: 'persist:hermes-browser',
      onDidStartLoading: handleDidStartLoading,
      onDidStopLoading: handleDidStopLoading,
      onDidNavigate: handleDidNavigate,
      onPageTitleUpdated: handlePageTitleUpdated,
    })
  })
}

// ---------------------------------------------------------------------------
// Tab 栏
// ---------------------------------------------------------------------------

function TabBar({ tabs, activeTabId, onSwitch, onClose, onNewTab }) {
  return jsx('div', {
    className: 'flex shrink-0 items-center border-b border-(--ui-stroke-tertiary) bg-(--ui-surface-background)',
    style: { minHeight: 32 },
    children: [
      // Tab 列表
      jsx('div', {
        className: 'flex flex-1 overflow-x-auto',
        style: { scrollbarWidth: 'none' },
        children: tabs.map((tab) =>
          jsx('div', {
            key: tab.id,
            onClick: () => onSwitch(tab.id),
            className: [
              'group flex shrink-0 items-center gap-1.5 border-r border-(--ui-stroke-tertiary)',
              'cursor-pointer px-3 py-1.5 text-xs',
              tab.id === activeTabId
                ? 'bg-(--ui-surface-background) text-(--ui-text-primary)'
                : 'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover)'
            ].join(' '),
            style: { maxWidth: 180 },
            children: [
              // 页面标题
              jsx('span', {
                className: 'truncate',
                children: tab.title || hostname(tab.url)
              }),
              // 关闭按钮
              tabs.length > 1 && jsx('span', {
                onClick: (e) => { e.stopPropagation(); onClose(tab.id) },
                className: 'shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-(--chrome-action-hover)',
                children: jsx(icons.X, { size: 12, stroke: 2 })
              })
            ]
          })
        )
      }),
      // 新建 Tab 按钮
      jsx('button', {
        type: 'button',
        onClick: onNewTab,
        className: 'inline-flex size-8 shrink-0 items-center justify-center text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)',
        title: 'New Tab',
        children: jsx(icons.Plus, { size: 14, stroke: 2 })
      })
    ]
  })
}

// ---------------------------------------------------------------------------
// BrowserPane（多 Tab 版本）
// ---------------------------------------------------------------------------

function BrowserPane({ storage }) {
  const [tabs, setTabs] = useState(() => {
    const id = nextTabId()
    return [{ id, url: 'about:blank', title: '' }]
  })
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id)
  const [inputUrl, setInputUrl] = useState('about:blank')
  const [history, setHistory] = useState({})  // tabId -> { stack, idx }
  const [bookmarks, setBookmarks] = useState(() => storage.get('bookmarks', []))
  const [menuOpen, setMenuOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [reinjectFlag, setReinjectFlag] = useState(0)

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0]

  // 获取/初始化某个 tab 的历史记录
  const getTabHistory = useCallback((tabId) => {
    return history[tabId] || { stack: ['about:blank'], idx: 0 }
  }, [history])

  const updateTabHistory = useCallback((tabId, updater) => {
    setHistory((prev) => {
      const current = prev[tabId] || { stack: ['about:blank'], idx: 0 }
      const next = typeof updater === 'function' ? updater(current) : updater
      return { ...prev, [tabId]: next }
    })
  }, [])

  // ── 新建 Tab ──
  const createTab = useCallback((url = 'about:blank') => {
    const id = nextTabId()
    setTabs((prev) => [...prev, { id, url, title: '' }])
    setActiveTabId(id)
    setInputUrl(url)
    updateTabHistory(id, { stack: [url], idx: 0 })
    return id
  }, [updateTabHistory])

  // ── 关闭 Tab ──
  const closeTab = useCallback((tabId) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId)
      if (prev.length <= 1) return prev // 最后一个 tab 不关闭
      const next = prev.filter((t) => t.id !== tabId)
      // 如果关闭的是当前 tab，切换到相邻 tab
      if (tabId === activeTabId) {
        const newActive = next[Math.min(idx, next.length - 1)]
        setActiveTabId(newActive.id)
        setInputUrl(newActive.url)
      }
      return next
    })
  }, [activeTabId])

  // ── 切换 Tab ──
  const switchTab = useCallback((tabId) => {
    const tab = tabs.find((t) => t.id === tabId)
    if (tab) {
      setActiveTabId(tabId)
      setInputUrl(tab.url)
    }
  }, [tabs])

  // ── 新窗口请求 → 新 Tab ──
  const handleNewTabRequest = useCallback((url) => {
    const normalized = normalizeUrl(url)
    if (!normalized) return
    createTab(normalized)
  }, [createTab])

  // ── 重新加载当前 tab ──
  const reloadTab = useCallback((tabId) => {
    // 切换到目标 tab 的 URL 重新设置以触发刷新
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return
    setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, url: '' } : t))
    setTimeout(() => {
      setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, url: tab.url } : t))
    }, 50)
  }, [tabs])

  // ── 手动注入拦截脚本到当前 tab ──
  const injectIntoActiveTab = useCallback(() => {
    // 通知 TabWebview 组件重新注入
    // 通过触发一个状态更新让 TabWebview 重新运行 injectInterceptScript
    setReinjectFlag((n) => n + 1)
  }, [])

  // ── Tab 内导航回调 ──
  const handleTabNavigate = useCallback((tabId, url) => {
    setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, url } : t))
    if (tabId === activeTabId) {
      setInputUrl(url)
    }
    updateTabHistory(tabId, (h) => {
      const newStack = h.stack.slice(0, h.idx + 1)
      newStack.push(url)
      return { stack: newStack, idx: newStack.length - 1 }
    })
  }, [activeTabId, updateTabHistory])

  // ── Tab 标题回调 ──
  const handleTabTitleChange = useCallback((tabId, title) => {
    setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, title } : t))
  }, [])

  // ── 收藏夹 ──
  const addBookmark = useCallback(() => {
    if (!activeTab) return
    setBookmarks((prev) => {
      if (prev.some((b) => b.url === activeTab.url)) return prev
      const updated = [...prev, { url: activeTab.url }]
      storage.set('bookmarks', updated)
      return updated
    })
  }, [activeTab, storage])

  const removeBookmark = useCallback((url) => {
    setBookmarks((prev) => {
      const updated = prev.filter((b) => b.url !== url)
      storage.set('bookmarks', updated)
      return updated
    })
  }, [storage])

  const openBookmark = useCallback((url) => {
    const normalized = normalizeUrl(url)
    if (!normalized) return
    // 在当前 tab 导航
    setTabs((prev) => prev.map((t) => t.id === activeTabId ? { ...t, url: normalized } : t))
    setInputUrl(normalized)
    updateTabHistory(activeTabId, (h) => {
      const newStack = h.stack.slice(0, h.idx + 1)
      newStack.push(normalized)
      return { stack: newStack, idx: newStack.length - 1 }
    })
  }, [activeTabId, updateTabHistory])

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  // ── 导航 ──
  const navigate = useCallback(() => {
    closeMenu()
    const target = normalizeUrl(inputUrl)
    if (!target) return
    setTabs((prev) => prev.map((t) => t.id === activeTabId ? { ...t, url: target } : t))
    updateTabHistory(activeTabId, (h) => {
      const newStack = h.stack.slice(0, h.idx + 1)
      newStack.push(target)
      return { stack: newStack, idx: newStack.length - 1 }
    })
  }, [inputUrl, activeTabId, updateTabHistory])

  const goBack = useCallback(() => {
    const h = getTabHistory(activeTabId)
    if (h.idx <= 0) return
    const newIdx = h.idx - 1
    const url = h.stack[newIdx]
    setTabs((prev) => prev.map((t) => t.id === activeTabId ? { ...t, url } : t))
    setInputUrl(url)
    updateTabHistory(activeTabId, { ...h, idx: newIdx })
  }, [activeTabId, getTabHistory, updateTabHistory])

  const goForward = useCallback(() => {
    const h = getTabHistory(activeTabId)
    if (h.idx >= h.stack.length - 1) return
    const newIdx = h.idx + 1
    const url = h.stack[newIdx]
    setTabs((prev) => prev.map((t) => t.id === activeTabId ? { ...t, url } : t))
    setInputUrl(url)
    updateTabHistory(activeTabId, { ...h, idx: newIdx })
  }, [activeTabId, getTabHistory, updateTabHistory])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); navigate() }
  }, [navigate])

  const tabHistory = getTabHistory(activeTabId)
  const isBookmarked = activeTab && bookmarks.some((b) => b.url === activeTab.url)

  return jsx('div', {
    className: 'flex h-full flex-col overflow-hidden',
    children: [
      // ── Tab 栏 ──
      jsx(TabBar, {
        tabs,
        activeTabId,
        onSwitch: switchTab,
        onClose: closeTab,
        onNewTab: () => createTab()
      }),

      // ── 工具栏 ──
      jsx('div', {
        className: 'flex shrink-0 items-center gap-1 border-b border-(--ui-stroke-tertiary) bg-(--ui-surface-background) px-1.5 py-1',
        children: [
          // 后退
          jsx('button', {
            type: 'button',
            onClick: () => { closeMenu(); goBack() },
            disabled: tabHistory.idx <= 0,
            className: [
              'inline-flex size-6 items-center justify-center rounded',
              tabHistory.idx > 0
                ? 'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)'
                : 'text-(--ui-text-quaternary) cursor-default'
            ].join(' '),
            children: jsx(icons.ChevronLeft, { size: 16, stroke: 2 })
          }),
          // 前进
          jsx('button', {
            type: 'button',
            onClick: () => { closeMenu(); goForward() },
            disabled: tabHistory.idx >= tabHistory.stack.length - 1,
            className: [
              'inline-flex size-6 items-center justify-center rounded',
              tabHistory.idx < tabHistory.stack.length - 1
                ? 'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)'
                : 'text-(--ui-text-quaternary) cursor-default'
            ].join(' '),
            children: jsx(icons.ChevronRight, { size: 16, stroke: 2 })
          }),
          // 刷新
          jsx('button', {
            type: 'button',
            onClick: () => { closeMenu(); reloadTab(activeTabId) },
            className: 'inline-flex size-6 items-center justify-center rounded text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)',
            children: jsx(icons.RefreshCw, { size: 14, stroke: 2 })
          }),
          // 注入按钮（调试用）
          jsx('button', {
            type: 'button',
            onClick: () => { injectIntoActiveTab() },
            className: 'inline-flex size-6 items-center justify-center rounded text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)',
            title: 'Re-inject tab monitor',
            children: jsx('svg', { xmlns:'http://www.w3.org/2000/svg', width:12, height:12, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2,
              children: jsx('path', { d:'M5 12h14M12 5l-7 7 7 7' })
            })
          }),
          // ★ 收藏按钮
          jsx('div', {
            className: 'relative',
            children: [
              jsx('button', {
                type: 'button',
                onMouseDown: (e) => e.stopPropagation(),
                onClick: () => setMenuOpen(!menuOpen),
                className: [
                  'inline-flex size-6 items-center justify-center rounded text-xs',
                  isBookmarked ? 'text-yellow-400' : 'text-(--ui-text-tertiary)'
                ].join(' '),
                title: isBookmarked ? 'Bookmarked' : 'Bookmark this page',
                children: jsx('svg', {
                  xmlns: 'http://www.w3.org/2000/svg', width: 16, height: 16,
                  viewBox: '0 0 24 24',
                  fill: isBookmarked ? '#facc15' : 'none',
                  stroke: isBookmarked ? '#facc15' : 'currentColor',
                  strokeWidth: isBookmarked ? 0 : 2,
                  strokeLinecap: 'round', strokeLinejoin: 'round',
                  children: jsx('path', {
                    d: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z'
                  })
                })
              }),
              jsx(BookmarkMenu, {
                open: menuOpen, onClose: () => setMenuOpen(false),
                bookmarks, onAdd: addBookmark, onRemove: removeBookmark, onOpen: openBookmark
              })
            ]
          }),
          // URL 输入
          jsx('input', {
            type: 'text', value: inputUrl,
            onChange: (e) => setInputUrl(e.target.value),
            onKeyDown: handleKeyDown, onFocus: closeMenu,
            placeholder: 'Enter a URL…',
            className: 'h-7 flex-1 rounded border border-(--ui-stroke-secondary) bg-(--ui-input-background) px-2 text-xs text-(--ui-text-primary) outline-none focus:border-(--ui-accent)'
          }),
          // Go
          jsx('button', {
            type: 'button', onClick: navigate,
            className: 'inline-flex h-7 items-center justify-center rounded bg-(--ui-accent) px-2 text-(--ui-accent-foreground) hover:opacity-90',
            children: jsx(icons.Send, { size: 14, stroke: 2 })
          })
        ]
      }),

      // ── Webview 容器（所有 tab 的 webview 叠放，只有 active 可见）──
      jsx('div', {
        className: 'relative flex min-h-0 flex-1 flex-col overflow-hidden',
        onMouseDown: closeMenu,
        children: tabs.map((tab) =>
          jsx(TabWebview, {
            key: tab.id,
            tab,
            isActive: tab.id === activeTabId,
            onNavigate: handleTabNavigate,
            onTitleChange: handleTabTitleChange,
            onNewTabRequest: handleNewTabRequest,
            reinjectFlag,
          })
        )
      })
    ]
  })
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

export default {
  id: 'web-browser-plugin',
  name: 'Web Browser',
  defaultEnabled: true,

  register(ctx) {
    const $visible = atom(true)

    const registerPane = (visible) => {
      ctx.register({
        id: 'pane',
        area: 'panes',
        title: 'Browser',
        order: 30,
        enabled: visible,
        data: {
          placement: 'right',
          width: 'clamp(18rem, 36vw, 40rem)',
          collapsible: true
        },
        render: () => jsx(BrowserPane, { storage: ctx.storage })
      })
    }

    const togglePane = () => {
      const next = !$visible.get()
      $visible.set(next)
      registerPane(next)
    }

    registerPane(true)

    ctx.register({
      id: 'toggle',
      area: KEYBINDS_AREA,
      label: 'Toggle Browser Pane',
      defaults: ['ctrl+shift+b'],
      run: togglePane
    })

    ctx.register({
      id: 'titlebar',
      area: 'titleBar.tools.right',
      data: {
        id: 'web-browser-toggle',
        label: 'Browser',
        title: 'Browser Plugin',
        icon: jsx('svg', {
          xmlns: 'http://www.w3.org/2000/svg', width: 14, height: 14,
          viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
          strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
          children: [
            jsx('path', { d: 'M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0' }),
            jsx('path', { d: 'M3.6 9h16.8' }),
            jsx('path', { d: 'M3.6 15h16.8' }),
            jsx('path', { d: 'M11.5 3a17 17 0 0 0 0 18' }),
            jsx('path', { d: 'M12.5 3a17 17 0 0 1 0 18' })
          ]
        }),
        onSelect: togglePane
      }
    })
  }
}
