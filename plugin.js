/**
 * Web Browser — 基于 <webview> 的 Hermes Desktop 内嵌浏览器插件。
 *
 * 使用 Electron webview 替代 iframe，解锁 executeJavaScript / capturePage 等能力。
 */

import { jsx } from 'react/jsx-runtime'
import { useState, useRef, useCallback, useEffect } from 'react'
import { icons, KEYBINDS_AREA, atom, useValue } from '@hermes/plugin-sdk'

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
// BrowserPane
// ---------------------------------------------------------------------------

function BrowserPane({ storage }) {
  const [inputUrl, setInputUrl] = useState('about:blank')
  const [currentUrl, setCurrentUrl] = useState('about:blank')
  const [pageTitle, setPageTitle] = useState('')
  const [history, setHistory] = useState(['about:blank'])
  const [historyIdx, setHistoryIdx] = useState(0)
  const [bookmarks, setBookmarks] = useState(() => storage.get('bookmarks', []))
  const [menuOpen, setMenuOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const webviewRef = useRef(null)

  // ── 收藏夹 ──
  const addBookmark = useCallback(() => {
    setBookmarks((prev) => {
      if (prev.some((b) => b.url === currentUrl)) return prev
      const updated = [...prev, { url: currentUrl }]
      storage.set('bookmarks', updated)
      return updated
    })
  }, [currentUrl, storage])

  const removeBookmark = useCallback((url) => {
    setBookmarks((prev) => {
      const updated = prev.filter((b) => b.url !== url)
      storage.set('bookmarks', updated)
      return updated
    })
  }, [storage])

  const openBookmark = useCallback((url) => {
    setInputUrl(url)
    setCurrentUrl(url)
  }, [])

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  // ── 导航 ──
  const navigate = useCallback(() => {
    closeMenu()
    const target = normalizeUrl(inputUrl)
    if (!target) return
    const newHistory = history.slice(0, historyIdx + 1)
    newHistory.push(target)
    setHistory(newHistory)
    setHistoryIdx(newHistory.length - 1)
    setCurrentUrl(target)
  }, [inputUrl, history, historyIdx])

  const goBack = useCallback(() => {
    if (historyIdx <= 0) return
    const idx = historyIdx - 1
    setHistoryIdx(idx)
    setCurrentUrl(history[idx])
    setInputUrl(history[idx])
  }, [history, historyIdx])

  const goForward = useCallback(() => {
    if (historyIdx >= history.length - 1) return
    const idx = historyIdx + 1
    setHistoryIdx(idx)
    setCurrentUrl(history[idx])
    setInputUrl(history[idx])
  }, [history, historyIdx])

  const reload = useCallback(() => {
    const wv = webviewRef.current
    if (wv) {
      wv.reload()
    }
  }, [])

  const stop = useCallback(() => {
    const wv = webviewRef.current
    if (wv) {
      wv.stop()
    }
  }, [])

  // ── webview 事件 ──
  const handleDidStartLoading = useCallback(() => setIsLoading(true), [])
  const handleDidStopLoading = useCallback(() => setIsLoading(false), [])

  const handleDidNavigate = useCallback((e) => {
    const url = e?.detail?.url || e?.url
    if (url) {
      setCurrentUrl(url)
      setInputUrl(url)
    }
  }, [])

  const handlePageTitleUpdated = useCallback((e) => {
    setPageTitle(e?.detail?.title || '')
  }, [])

  const handleDomReady = useCallback(() => {
    // webview DOM 就绪
  }, [])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); navigate() }
  }, [navigate])

  const isBookmarked = bookmarks.some((b) => b.url === currentUrl)

  return jsx('div', {
    className: 'flex h-full flex-col overflow-hidden',
    children: [
      // ── 工具栏 ──
      jsx('div', {
        className: 'flex shrink-0 items-center gap-1 border-b border-(--ui-stroke-tertiary) bg-(--ui-surface-background) px-1.5 py-1',
        children: [
          // 后退
          jsx('button', {
            type: 'button',
            onClick: () => { closeMenu(); goBack() },
            disabled: historyIdx <= 0,
            className: [
              'inline-flex size-6 items-center justify-center rounded',
              historyIdx > 0
                ? 'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)'
                : 'text-(--ui-text-quaternary) cursor-default'
            ].join(' '),
            children: jsx(icons.ChevronLeft, { size: 16, stroke: 2 })
          }),
          // 前进
          jsx('button', {
            type: 'button',
            onClick: () => { closeMenu(); goForward() },
            disabled: historyIdx >= history.length - 1,
            className: [
              'inline-flex size-6 items-center justify-center rounded',
              historyIdx < history.length - 1
                ? 'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)'
                : 'text-(--ui-text-quaternary) cursor-default'
            ].join(' '),
            children: jsx(icons.ChevronRight, { size: 16, stroke: 2 })
          }),
          // 刷新/停止
          jsx('button', {
            type: 'button',
            onClick: () => { closeMenu(); isLoading ? stop() : reload() },
            className: 'inline-flex size-6 items-center justify-center rounded text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)',
            children: isLoading
              ? jsx(icons.X, { size: 14, stroke: 2 })
              : jsx(icons.RefreshCw, { size: 14, stroke: 2 })
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

      // ── 页面标题栏（可选，显示当前页面标题）──
      pageTitle && jsx('div', {
        className: 'flex shrink-0 items-center border-b border-(--ui-stroke-tertiary) bg-(--ui-surface-background) px-2 py-0.5',
        children: jsx('span', {
          className: 'truncate text-[10px] text-(--ui-text-quaternary)',
          children: pageTitle
        })
      }),

      // ── webview 容器 ──
      jsx('div', {
        className: 'relative min-h-0 flex-1 overflow-hidden',
        onMouseDown: closeMenu,
        children: jsx('webview', {
          ref: webviewRef,
          src: currentUrl,
          className: 'absolute inset-0 h-full w-full border-none',
          style: { background: 'white' },
          autosize: 'on',
          partition: 'persist:hermes-browser',
          // 事件
          onDidStartLoading: handleDidStartLoading,
          onDidStopLoading: handleDidStopLoading,
          onDidNavigate: handleDidNavigate,
          onPageTitleUpdated: handlePageTitleUpdated,
          onDomReady: handleDomReady,
        })
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
