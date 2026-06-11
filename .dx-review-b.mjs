// DX review driver — scenario B: navigation at scale, core flows, errors
import { _electron as electron } from 'playwright'
import fs from 'fs'

const REPO = '/Users/aleph/Desktop/Projects/marlboro-red/smoke'
const SHOT = '/tmp/dx-review'
fs.mkdirSync(SHOT, { recursive: true })
const log = (...a) => console.log('[dx]', ...a)

const app = await electron.launch({
  args: [`${REPO}/out/main/index.js`],
  cwd: REPO,
  env: { ...process.env, NODE_ENV: 'production', ELECTRON_DISABLE_GPU: '1', SMOKE_E2E_CONFIG_DIR: '/tmp/dx-review-config' },
})
const page = await app.firstWindow({ timeout: 60000 })
page.on('console', (m) => { if (m.type() === 'error') console.log('[console-err]', m.text().slice(0, 250)) })
page.on('dialog', (d) => { console.log('[dialog]', d.type(), d.message()); d.dismiss().catch(() => {}) })
await page.waitForLoadState('domcontentloaded')
await page.waitForSelector('.sidebar-create-btn', { timeout: 20000 })
await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1600, 1000); w.center() })
await page.waitForTimeout(800)
const shot = async (name) => { await page.screenshot({ path: `${SHOT}/${name}.png` }); log('shot', name) }

// ---------- 3. NAVIGATION AT SCALE: create 8 elements spread out ----------
log('=== SCALE: create 8 elements ===')
// 5 terminals via double-click at spread canvas positions (with panning between)
const spots = [[600, 300], [1100, 300], [600, 700], [1100, 700]]
for (const [x, y] of spots) {
  await page.mouse.dblclick(x, y)
  await page.waitForTimeout(700)
}
// pan the canvas right by dragging empty space? use store-level pan via zoom out
await page.keyboard.press('Meta+-')
await page.keyboard.press('Meta+-')
await page.waitForTimeout(300)
await page.mouse.dblclick(1300, 850)
await page.waitForTimeout(700)
// note + snippet + webview via create menu
for (const label of ['Note', 'Code Snippet', 'Web Browser']) {
  await page.click('.sidebar-create-btn')
  await page.waitForTimeout(250)
  await page.click(`.create-menu-item:has-text("${label}")`)
  await page.waitForTimeout(500)
}
const nSessions = await page.evaluate(() => window.__SMOKE_STORES__?.sessionStore?.getState().sessions.size)
log('sessions created:', nSessions)
await shot('10-eight-elements')

// sidebar list state
const sidebarList = await page.evaluate(() => [...document.querySelectorAll('.session-list .session-title')].map((e) => e.textContent))
log('sidebar titles:', JSON.stringify(sidebarList))

// minimap presence + click navigation
const minimapBox = await page.locator('.minimap').boundingBox().catch(() => null)
log('minimap box:', JSON.stringify(minimapBox))
if (minimapBox) {
  await page.mouse.click(minimapBox.x + 10, minimapBox.y + 10)
  await page.waitForTimeout(500)
  await shot('11-minimap-click')
}

// Cmd+1 focus first session — does it pan AND focus the terminal for typing?
await page.keyboard.press('Meta+1')
await page.waitForTimeout(600)
const afterCmd1 = await page.evaluate(() => ({ focusedId: window.__SMOKE_STORES__?.sessionStore?.getState().focusedId, active: document.activeElement?.className }))
log('after Cmd+1:', JSON.stringify(afterCmd1))
await shot('12-after-cmd1')

// Ctrl/Cmd+Tab cycle (CDP path)
await page.keyboard.press('Meta+Tab')
await page.waitForTimeout(400)
const afterTab = await page.evaluate(() => window.__SMOKE_STORES__?.sessionStore?.getState().focusedId)
log('after Meta+Tab focusedId:', afterTab, '(note: real Cmd+Tab is the macOS app switcher)')

// canvas search Cmd+Shift+F
await page.keyboard.press('Meta+Shift+f')
await page.waitForTimeout(400)
await shot('13-canvas-search')
const searchVisible = await page.evaluate(() => !!document.querySelector('[class*="search-modal"], [class*="search"] input'))
log('canvas search visible:', searchVisible)
if (searchVisible) {
  await page.keyboard.type('hello')
  await page.waitForTimeout(600)
  await shot('14-canvas-search-results')
}
await page.keyboard.press('Escape')

// command palette jump by name
await page.keyboard.press('Meta+p')
await page.waitForTimeout(300)
await page.keyboard.type('note')
await page.waitForTimeout(300)
await shot('15-palette-jump')
await page.keyboard.press('Enter')
await page.waitForTimeout(600)
await shot('16-after-palette-jump')

// ---------- 4. CORE FLOWS ----------
log('=== CORE FLOWS ===')
// split pane: focus a terminal first via Cmd+1
await page.keyboard.press('Meta+1')
await page.waitForTimeout(500)
await page.keyboard.press('Meta+\\')
await page.waitForTimeout(1000)
const paneCount = await page.evaluate(() => document.querySelectorAll('.terminal-window .terminal-container').length)
log('after split, terminal containers visible:', paneCount)
await shot('17-split-pane')
// navigate panes
await page.keyboard.press('Meta+Alt+ArrowRight')
await page.waitForTimeout(300)
// close pane
await page.keyboard.press('Meta+Shift+w')
await page.waitForTimeout(500)
await shot('18-pane-closed')

// open file from file tree
await page.click('.ft-row:has-text("CLAUDE.md"), .file-tree-item:has-text("CLAUDE.md"), [class*="ft-"]:has-text("CLAUDE.md")', { timeout: 5000 }).catch(async (e) => {
  log('file tree click failed, trying generic text click:', e.message.slice(0, 80))
  await page.click('text=CLAUDE.md').catch(() => log('still failed'))
})
await page.waitForTimeout(1200)
await shot('19-file-open')
const fileSessions = await page.evaluate(() => [...window.__SMOKE_STORES__.sessionStore.getState().sessions.values()].filter((s) => s.type === 'file').map((s) => s.title))
log('file sessions:', JSON.stringify(fileSessions))

// edit mode Cmd+E, type, then close without saving — warning?
await page.keyboard.press('Meta+e')
await page.waitForTimeout(600)
await shot('20-file-edit-mode')
const editing = await page.evaluate(() => [...window.__SMOKE_STORES__.sessionStore.getState().sessions.values()].find((s) => s.type === 'file')?.editing)
log('file editing mode:', editing)
if (editing) {
  await page.click('.cm-content').catch(() => log('no cm-content'))
  await page.keyboard.type('DX REVIEW EDIT ')
  await page.waitForTimeout(400)
  await shot('21-file-dirty')
  // close the file window via chrome X
  const fileWin = page.locator('.terminal-window:has(.cm-content) .window-chrome-close').first()
  await fileWin.click().catch(() => log('file close click failed'))
  await page.waitForTimeout(500)
  await shot('22-file-closed-unsaved')
  const fileStillThere = await page.evaluate(() => [...window.__SMOKE_STORES__.sessionStore.getState().sessions.values()].some((s) => s.type === 'file'))
  log('unsaved file: closed without warning?', !fileStillThere)
}

// rename via sidebar double-click
const firstTitle = page.locator('.session-list .session-title').first()
await firstTitle.dblclick()
await page.waitForTimeout(300)
await shot('23-rename-sidebar')
const renameInput = await page.evaluate(() => !!document.querySelector('.session-list input'))
log('sidebar rename input appeared:', renameInput)
if (renameInput) {
  await page.keyboard.type('renamed-term')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
}

// right-click sidebar item — context menu contents
await page.locator('.session-list .session-list-item, .session-list [class*="session"]').first().click({ button: 'right' })
await page.waitForTimeout(300)
await shot('24-sidebar-context')
const ctxItems = await page.evaluate(() => [...document.querySelectorAll('[class*="context-menu"] button, [class*="context-menu"] [class*="item"]')].map((e) => e.textContent))
log('sidebar context items:', JSON.stringify(ctxItems))
await page.keyboard.press('Escape')

// right-click a terminal window on canvas — anything?
await page.keyboard.press('Meta+1')
await page.waitForTimeout(400)
const termWin = page.locator('.terminal-window').first()
const tb = await termWin.boundingBox()
if (tb) {
  await page.mouse.click(tb.x + tb.width / 2, tb.y + 10, { button: 'right' })
  await page.waitForTimeout(300)
  const winCtx = await page.evaluate(() => !!document.querySelector('[class*="context-menu"]'))
  log('terminal window right-click menu:', winCtx)
  await shot('25-window-rightclick')
  await page.keyboard.press('Escape')
}

// group: select all then group
await page.mouse.click(450, 950) // empty canvas to unfocus
await page.keyboard.press('Meta+a')
await page.waitForTimeout(300)
const selCount = await page.evaluate(() => window.__SMOKE_STORES__.sessionStore.getState().selectedIds.size)
log('selected after Cmd+A on canvas:', selCount)
await page.keyboard.press('Meta+Alt+g')
await page.waitForTimeout(500)
const groups = await page.evaluate(() => window.__SMOKE_STORES__?.groupStore ? window.__SMOKE_STORES__.groupStore.getState().groups.size ?? JSON.stringify(window.__SMOKE_STORES__.groupStore.getState().groups).slice(0,100) : 'no store handle')
log('groups after Cmd+Alt+G:', groups)
await shot('26-grouped')

await app.close()
log('DONE scenario B')
