/**
 * Repeatable performance benchmark: drives the built app (out/) with
 * Playwright, builds a heavy session (22 live shells + 4 notes), and
 * samples frame times during idle / pan / zoom / drag / output flood /
 * typing, then reports per-process memory.
 *
 * Usage: npm run build && node scripts/perf-bench.mjs
 */
import { _electron as electron } from 'playwright'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_DIR = '/tmp/smoke-bench/config'
fs.rmSync('/tmp/smoke-bench', { recursive: true, force: true })
fs.mkdirSync(CONFIG_DIR, { recursive: true })

const log = (...a) => console.log('[bench]', ...a)

const t0 = Date.now()
const app = await electron.launch({
  args: [path.join(REPO, 'out', 'main', 'index.js')],
  cwd: REPO,
  env: { ...process.env, NODE_ENV: 'production', SMOKE_E2E_CONFIG_DIR: CONFIG_DIR },
})
const page = await app.firstWindow({ timeout: 60000 })
await page.waitForLoadState('domcontentloaded')
await page.waitForSelector('.sidebar-create-btn', { timeout: 20000 })
log(`startup to interactive: ${Date.now() - t0}ms`)
await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1600, 1000); w.center() })

function sampleFrames(ms) {
  return page.evaluate((duration) => new Promise((resolve) => {
    const deltas = []
    let last = performance.now()
    const end = last + duration
    function tick(now) {
      deltas.push(now - last)
      last = now
      if (now < end) requestAnimationFrame(tick)
      else {
        deltas.sort((a, b) => a - b)
        const avg = deltas.reduce((s, d) => s + d, 0) / deltas.length
        resolve({
          frames: deltas.length,
          avg: Math.round(avg * 10) / 10,
          p95: Math.round(deltas[Math.floor(deltas.length * 0.95)] * 10) / 10,
          worst: Math.round(deltas[deltas.length - 1] * 10) / 10,
          dropped: deltas.filter((d) => d > 33).length,
        })
      }
    }
    requestAnimationFrame(tick)
  }), ms)
}

log('creating 22 terminals + 4 notes...')
for (let i = 0; i < 22; i++) {
  await page.keyboard.press('Meta+n')
  await page.waitForTimeout(120)
}
for (let i = 0; i < 4; i++) {
  await page.locator('.sidebar-create-btn').click()
  await page.locator('.create-menu-item', { hasText: 'Note' }).click()
  await page.waitForTimeout(80)
}
await page.waitForTimeout(2500)
log(`elements on canvas: ${await page.evaluate(() => document.querySelectorAll('[data-session-id]').length)}`)

log('IDLE     :', JSON.stringify(await sampleFrames(2000)))

const root = await page.locator('.canvas-root').boundingBox()
const cx = root.x + root.width / 2, cy = root.y + root.height / 2
const panPromise = sampleFrames(3000)
for (let pass = 0; pass < 6; pass++) {
  const dir = pass % 2 === 0 ? 1 : -1
  await page.mouse.move(cx, cy)
  await page.mouse.down({ button: 'middle' })
  for (let i = 0; i <= 10; i++) {
    await page.mouse.move(cx + dir * i * 40, cy + dir * i * 20, { steps: 1 })
    await page.waitForTimeout(8)
  }
  await page.mouse.up({ button: 'middle' })
}
log('PAN      :', JSON.stringify(await panPromise))

const zoomPromise = sampleFrames(3000)
await page.keyboard.down('Control')
for (let i = 0; i < 25; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(40) }
for (let i = 0; i < 25; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(40) }
await page.keyboard.up('Control')
log('ZOOM     :', JSON.stringify(await zoomPromise))

const cb = await page.locator('.terminal-window:not(.note-window) .window-chrome').first().boundingBox()
if (cb) {
  const dragPromise = sampleFrames(2500)
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
  await page.mouse.down()
  for (let i = 0; i < 60; i++) {
    await page.mouse.move(
      cb.x + cb.width / 2 + Math.sin(i / 5) * 250,
      cb.y + cb.height / 2 + Math.cos(i / 5) * 120,
      { steps: 1 }
    )
    await page.waitForTimeout(16)
  }
  await page.mouse.up()
  log('DRAG     :', JSON.stringify(await dragPromise))
}

await page.locator('.terminal-window:not(.note-window) .terminal-container').last().click({ position: { x: 40, y: 30 }, force: true })
await page.waitForTimeout(400)
const floodPromise = sampleFrames(4000)
await page.keyboard.type('seq 1 100000', { delay: 5 })
await page.keyboard.press('Enter')
log('FLOOD    :', JSON.stringify(await floodPromise))

const typePromise = sampleFrames(2000)
await page.keyboard.type('echo the quick brown fox jumps over the lazy dog', { delay: 30 })
log('TYPING   :', JSON.stringify(await typePromise))
await page.keyboard.press('Enter')

const metrics = await app.evaluate(({ app: a }) => a.getAppMetrics().map((m) => ({
  type: m.type,
  mem: Math.round(m.memory.workingSetSize / 1024),
  cpu: Math.round(m.cpu.percentCPUUsage * 10) / 10,
})))
log('MEMORY MB by process:', JSON.stringify(metrics))
log(`TOTAL: ${metrics.reduce((s, m) => s + m.mem, 0)} MB across ${metrics.length} processes`)

await app.close()
log('DONE')
