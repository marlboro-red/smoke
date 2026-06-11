import { _electron as electron } from 'playwright'
import path from 'path'
import fs from 'fs'

import { fileURLToPath } from 'url'
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_DIR = '/tmp/smoke-bench/flood-config'
fs.rmSync(CONFIG_DIR, { recursive: true, force: true })
fs.mkdirSync(CONFIG_DIR, { recursive: true })
const MARK_DIR = '/tmp/smoke-bench/marks'
fs.rmSync(MARK_DIR, { recursive: true, force: true })
fs.mkdirSync(MARK_DIR, { recursive: true })

const log = (...a) => console.log('[flood]', ...a)

const app = await electron.launch({
  args: [path.join(REPO, 'out', 'main', 'index.js')],
  cwd: REPO,
  env: { ...process.env, NODE_ENV: 'production', SMOKE_E2E_CONFIG_DIR: CONFIG_DIR },
})
const page = await app.firstWindow({ timeout: 60000 })
await page.waitForLoadState('domcontentloaded')
await page.waitForSelector('.sidebar-create-btn', { timeout: 20000 })
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

// 12 terminals, all visible
log('creating 12 terminals...')
for (let i = 0; i < 12; i++) {
  await page.keyboard.press('Meta+n')
  await page.waitForTimeout(150)
}
await page.waitForTimeout(2500)

const ids = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.terminal-window:not(.note-window)'))
    .map((el) => el.getAttribute('data-session-id'))
)
log(`terminals: ${ids.length}`)

// ── Scenario 1: ALL 12 flood 200k lines simultaneously ──
const floodStart = Date.now()
await page.evaluate(({ sessionIds, markDir }) => {
  sessionIds.forEach((id, i) => {
    window.smokeAPI.pty.write(id, `seq 1 200000; echo FLOOD_DONE_${i} > ${markDir}/done-${i}\n`)
  })
}, { sessionIds: ids, markDir: MARK_DIR })

const allFlood = await sampleFrames(5000)
log('12x SIMULTANEOUS FLOOD       :', JSON.stringify(allFlood))

// ── Scenario 2: pan hard while they're still flooding ──
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
log('PAN DURING 12x FLOOD         :', JSON.stringify(await panPromise))

// ── Scenario 3: type in terminal #1 while the rest flood ──
await page.locator(`[data-session-id="${ids[0]}"] .terminal-container`).click({ position: { x: 40, y: 30 }, force: true })
await page.waitForTimeout(300)
const typePromise = sampleFrames(2500)
await page.keyboard.type('echo typing-under-full-load-still-works', { delay: 25 })
log('TYPING DURING 12x FLOOD      :', JSON.stringify(await typePromise))
await page.keyboard.press('Enter')

// ── Drain time: wait for all DONE markers ──
let drained = 0
while (drained < ids.length && Date.now() - floodStart < 120000) {
  drained = fs.readdirSync(MARK_DIR).length
  if (drained < ids.length) await new Promise((r) => setTimeout(r, 500))
}
log(`ALL FLOODS DRAINED: ${drained}/${ids.length} in ${((Date.now() - floodStart) / 1000).toFixed(1)}s (12 x 200k lines = 2.4M lines total)`)

const metrics = await app.evaluate(({ app: a }) => a.getAppMetrics().map((m) => ({
  type: m.type, mem: Math.round(m.memory.workingSetSize / 1024),
})))
log('MEMORY MB:', JSON.stringify(metrics), 'TOTAL:', metrics.reduce((s, m) => s + m.mem, 0))

await app.close()
log('DONE')
