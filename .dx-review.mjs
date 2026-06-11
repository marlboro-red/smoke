// DX review driver — scenario A: first run, creation, shortcuts
import { _electron as electron } from 'playwright'
import fs from 'fs'

const REPO = '/Users/aleph/Desktop/Projects/marlboro-red/smoke'
const SHOT = '/tmp/dx-review'
fs.mkdirSync(SHOT, { recursive: true })
const CONFIG = process.env.DX_CONFIG_DIR || '/tmp/dx-review-config'

const log = (...a) => console.log('[dx]', ...a)
const shot = async (page, name) => { await page.screenshot({ path: `${SHOT}/${name}.png` }); log('shot', name) }

const app = await electron.launch({
  args: [`${REPO}/out/main/index.js`],
  cwd: REPO,
  env: { ...process.env, NODE_ENV: 'production', ELECTRON_DISABLE_GPU: '1', SMOKE_E2E_CONFIG_DIR: CONFIG },
})
const page = await app.firstWindow({ timeout: 60000 })
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text().slice(0, 300)) })
page.on('dialog', (d) => { console.log('[dialog]', d.type(), d.message()); d.dismiss().catch(() => {}) })
await page.waitForLoadState('domcontentloaded')
await page.waitForSelector('.sidebar-create-btn', { timeout: 20000 })
await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1600, 1000); w.center() })
await page.waitForTimeout(800)

// ---------- 1. FIRST RUN ----------
log('=== FIRST RUN ===')
await shot(page, '01-first-run')
const emptyText = await page.evaluate(() => document.querySelector('.canvas-root')?.innerText?.slice(0, 500))
log('canvas innerText:', JSON.stringify(emptyText))
const statusbar = await page.evaluate(() => document.querySelector('.status-bar, [class*="status"]')?.innerText)
log('statusbar:', JSON.stringify(statusbar))

// right-click on empty canvas — context menu?
await page.mouse.click(800, 500, { button: 'right' })
await page.waitForTimeout(400)
const ctxMenu = await page.evaluate(() => !!document.querySelector('.context-menu, [class*="context-menu"]'))
log('canvas right-click menu appeared:', ctxMenu)
await shot(page, '02-canvas-rightclick')
await page.keyboard.press('Escape')

// menu accelerators registered natively?
const menuInfo = await app.evaluate(({ Menu }) => {
  const m = Menu.getApplicationMenu()
  const flat = []
  const walk = (items, path) => items.forEach((i) => { flat.push({ path: path + '>' + (i.label || i.role), role: i.role, accel: i.accelerator }); if (i.submenu) walk(i.submenu.items, path + '>' + (i.label || i.role)) })
  walk(m.items, '')
  return flat
})
log('NATIVE MENU:', JSON.stringify(menuInfo, null, 1))

// create menu via sidebar +
await page.click('.sidebar-create-btn')
await page.waitForTimeout(300)
await shot(page, '03-create-menu')
const createItems = await page.evaluate(() => [...document.querySelectorAll('.create-menu-item')].map((e) => e.innerText.replace(/\n/g, ' ')))
log('create menu items:', JSON.stringify(createItems))
await page.click('.create-menu-item:has-text("Terminal")')
await page.waitForTimeout(1500)
await shot(page, '04-first-terminal')

// type a command into the terminal
await page.click('.terminal-window .terminal-container')
await page.waitForTimeout(300)
await page.keyboard.type('echo hello-smoke && sleep 500', { delay: 20 })
await page.keyboard.press('Enter')
await page.waitForTimeout(800)
await shot(page, '05-terminal-running')

// ---------- 2. SHORTCUTS with terminal focused ----------
log('=== SHORTCUTS (terminal focused) ===')
const focusedBefore = await page.evaluate(() => ({ active: document.activeElement?.className, focusedId: window.__SMOKE_STORES__?.sessionStore?.getState().focusedId }))
log('before Escape:', JSON.stringify(focusedBefore))
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
const focusedAfter = await page.evaluate(() => ({ active: document.activeElement?.className, focusedId: window.__SMOKE_STORES__?.sessionStore?.getState().focusedId }))
log('after Escape (terminal had focus):', JSON.stringify(focusedAfter))

// refocus terminal, try Cmd+K (saveBookmark via prompt())
await page.click('.terminal-window .terminal-container')
await page.waitForTimeout(200)
await page.keyboard.press('Meta+k')
await page.waitForTimeout(400)
await shot(page, '06-after-cmd-k')
log('after Cmd+K — check console for prompt() error above')

// Cmd+= zoom in (blocked by before-input-event?)
const zoomBefore = await page.evaluate(() => window.__SMOKE_STORES__?.canvasStore?.getState().zoom)
await page.keyboard.press('Meta+=')
await page.waitForTimeout(400)
const zoomAfter = await page.evaluate(() => window.__SMOKE_STORES__?.canvasStore?.getState().zoom)
log('zoom before/after Cmd+= :', zoomBefore, zoomAfter)

// Cmd+/ shortcuts overlay
await page.keyboard.press('Meta+/')
await page.waitForTimeout(400)
const overlayVisible = await page.evaluate(() => !!document.querySelector('.shortcuts-overlay, [class*="shortcuts"]'))
log('shortcuts overlay visible:', overlayVisible)
await shot(page, '07-shortcuts-overlay')
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// Cmd+P command palette
await page.keyboard.press('Meta+p')
await page.waitForTimeout(400)
await shot(page, '08-command-palette')
const paletteItems = await page.evaluate(() => [...document.querySelectorAll('[class*="palette-item"], [class*="palette"] li')].slice(0, 30).map((e) => e.innerText.replace(/\n/g, ' | ')))
log('palette items:', JSON.stringify(paletteItems))
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// Cmd+W via renderer path (CDP). Count sessions before/after; count windows too.
const counts1 = await page.evaluate(() => window.__SMOKE_STORES__?.sessionStore?.getState().sessions.size)
await page.click('.terminal-window .terminal-container')
await page.keyboard.press('Meta+w')
await page.waitForTimeout(600)
const counts2 = await page.evaluate(() => window.__SMOKE_STORES__?.sessionStore?.getState().sessions.size).catch(() => 'WINDOW GONE')
const nWindows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
log('Cmd+W: sessions before/after:', counts1, counts2, 'windows:', nWindows, '(note: real keypress hits native menu role=close)')
await shot(page, '09-after-cmd-w')

await app.close()
log('DONE scenario A')
