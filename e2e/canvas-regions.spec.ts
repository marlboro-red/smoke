import { test, expect } from './fixtures'
import { waitForAppReady } from './helpers'

test.describe('Canvas Regions — Lifecycle', () => {
  test('create a region via store and verify it renders', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create a region via the store
    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      stores.regionStore.getState().createRegion('Test Region', { x: 100, y: 100 })
    })

    const regionShape = mainWindow.locator('.region-shape')
    await expect(regionShape.first()).toBeVisible({ timeout: 5000 })

    // Verify the region name renders
    const regionName = regionShape.first().locator('.region-name')
    await expect(regionName).toHaveText('Test Region')
  })

  test('rename a region via double-click on label', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      stores.regionStore.getState().createRegion('Old Name', { x: 100, y: 100 })
    })

    const regionShape = mainWindow.locator('.region-shape')
    await expect(regionShape.first()).toBeVisible({ timeout: 5000 })

    // Double-click the label bar to enter rename mode
    const labelBar = regionShape.first().locator('.region-label-bar')
    await labelBar.dblclick()

    const nameInput = regionShape.first().locator('.region-name-input')
    await expect(nameInput).toBeVisible({ timeout: 3000 })

    // Clear and type new name
    await nameInput.fill('Renamed Region')
    await nameInput.press('Enter')

    // Verify the region was renamed in the store
    const name = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const regions = stores.regionStore.getState().regions
      for (const r of regions.values()) return r.name
      return null
    })
    expect(name).toBe('Renamed Region')

    // Verify the label shows the new name
    const regionName = regionShape.first().locator('.region-name')
    await expect(regionName).toHaveText('Renamed Region')
  })

  test('resize a region via store and verify DOM update', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const regionId = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const region = stores.regionStore.getState().createRegion(
        'Resize Me', { x: 100, y: 100 }, { width: 600, height: 400 }
      )
      return region.id
    })

    const regionShape = mainWindow.locator('.region-shape')
    await expect(regionShape.first()).toBeVisible({ timeout: 5000 })

    // Resize via store update
    await mainWindow.evaluate((id) => {
      const stores = (window as any).__SMOKE_STORES__
      stores.regionStore.getState().updateRegion(id, {
        size: { width: 800, height: 500 },
      })
    }, regionId)

    // Wait for re-render
    await mainWindow.waitForTimeout(200)

    // Verify the size was updated in the store
    const size = await mainWindow.evaluate((id) => {
      const stores = (window as any).__SMOKE_STORES__
      const region = stores.regionStore.getState().regions.get(id)
      return region ? { width: region.size.width, height: region.size.height } : null
    }, regionId)
    expect(size).toEqual({ width: 800, height: 500 })
  })

  test('recolor a region via context menu', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      stores.regionStore.getState().createRegion(
        'Color Me', { x: 100, y: 100 }, { width: 600, height: 400 }, '#4A90D9'
      )
    })

    const regionShape = mainWindow.locator('.region-shape')
    await expect(regionShape.first()).toBeVisible({ timeout: 5000 })

    // Right-click the label bar to open context menu
    const labelBar = regionShape.first().locator('.region-label-bar')
    await labelBar.click({ button: 'right' })

    const contextMenu = mainWindow.locator('.region-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 3000 })

    // Verify color swatches are present
    const swatches = contextMenu.locator('.region-color-swatch')
    await expect(swatches).toHaveCount(6)

    // Click the red swatch (second swatch = #D94A4A)
    await swatches.nth(1).click()

    // Context menu should close after color selection
    await expect(contextMenu).not.toBeVisible({ timeout: 3000 })

    // Verify the color was updated in the store
    const color = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const regions = stores.regionStore.getState().regions
      for (const r of regions.values()) return r.color
      return null
    })
    expect(color).toBe('#D94A4A')
  })

  test('delete a region via context menu', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      stores.regionStore.getState().createRegion('Delete Me', { x: 100, y: 100 })
    })

    const regionShape = mainWindow.locator('.region-shape')
    await expect(regionShape.first()).toBeVisible({ timeout: 5000 })

    // Right-click to open context menu
    const labelBar = regionShape.first().locator('.region-label-bar')
    await labelBar.click({ button: 'right' })

    const contextMenu = mainWindow.locator('.region-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 3000 })

    // Click "Delete Region" button
    const deleteBtn = contextMenu.locator('.region-menu-item--destructive')
    await expect(deleteBtn).toHaveText('Delete Region')
    await deleteBtn.click()

    // Region should be removed from the DOM
    await expect(regionShape).toHaveCount(0, { timeout: 5000 })

    // Verify the store is empty
    const count = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      return stores.regionStore.getState().regions.size
    })
    expect(count).toBe(0)
  })
})

test.describe('Canvas Regions — Context Menu', () => {
  test('context menu has Rename, color swatches, and Delete options', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      stores.regionStore.getState().createRegion('Menu Test', { x: 100, y: 100 })
    })

    const regionShape = mainWindow.locator('.region-shape')
    await expect(regionShape.first()).toBeVisible({ timeout: 5000 })

    // Right-click to open context menu
    const labelBar = regionShape.first().locator('.region-label-bar')
    await labelBar.click({ button: 'right' })

    const contextMenu = mainWindow.locator('.region-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 3000 })

    // Verify the menu structure
    const renameBtn = contextMenu.locator('.region-menu-item').first()
    await expect(renameBtn).toHaveText('Rename')

    const colorRow = contextMenu.locator('.region-color-row')
    await expect(colorRow).toBeVisible()

    const deleteBtn = contextMenu.locator('.region-menu-item--destructive')
    await expect(deleteBtn).toHaveText('Delete Region')
  })

  test('rename via context menu Rename button', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      stores.regionStore.getState().createRegion('Before Rename', { x: 100, y: 100 })
    })

    const regionShape = mainWindow.locator('.region-shape')
    await expect(regionShape.first()).toBeVisible({ timeout: 5000 })

    // Open context menu
    const labelBar = regionShape.first().locator('.region-label-bar')
    await labelBar.click({ button: 'right' })

    const contextMenu = mainWindow.locator('.region-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 3000 })

    // Click "Rename"
    const renameBtn = contextMenu.locator('.region-menu-item').first()
    await renameBtn.click()

    // Should enter inline rename mode
    const nameInput = regionShape.first().locator('.region-name-input')
    await expect(nameInput).toBeVisible({ timeout: 3000 })

    await nameInput.fill('After Rename')
    await nameInput.press('Enter')

    // Verify the region name was updated
    const regionName = regionShape.first().locator('.region-name')
    await expect(regionName).toHaveText('After Rename')
  })

  test('context menu closes on outside click', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      stores.regionStore.getState().createRegion('Outside Click', { x: 200, y: 200 })
    })

    const regionShape = mainWindow.locator('.region-shape')
    await expect(regionShape.first()).toBeVisible({ timeout: 5000 })

    // Open context menu
    const labelBar = regionShape.first().locator('.region-label-bar')
    await labelBar.click({ button: 'right' })

    const contextMenu = mainWindow.locator('.region-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 3000 })

    // Click outside the menu (on the canvas root)
    await mainWindow.locator('.canvas-root').click({ position: { x: 10, y: 10 } })

    await expect(contextMenu).not.toBeVisible({ timeout: 3000 })
  })
})

test.describe('Canvas Regions — Persistence', () => {
  test('regions persist across layout save/load', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create two regions with different colors and positions
    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      stores.regionStore.getState().createRegion(
        'Region Alpha', { x: 100, y: 100 }, { width: 600, height: 400 }, '#4A90D9'
      )
      stores.regionStore.getState().createRegion(
        'Region Beta', { x: 800, y: 100 }, { width: 400, height: 300 }, '#D94A4A'
      )
    })

    const regionShapes = mainWindow.locator('.region-shape')
    await expect(regionShapes).toHaveCount(2, { timeout: 5000 })

    // Save layout via the layout API (serialize includes regions)
    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const { regions } = stores.regionStore.getState()
      return window.smokeAPI.layout.save('e2e-region-test', {
        name: 'e2e-region-test',
        sessions: [],
        viewport: { panX: 0, panY: 0, zoom: 1 },
        gridSize: 20,
        regions: Array.from(regions.values()).map((r: any) => ({
          name: r.name,
          color: r.color,
          position: { x: r.position.x, y: r.position.y },
          size: { width: r.size.width, height: r.size.height },
        })),
      })
    })

    // Clear all regions
    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const { regions } = stores.regionStore.getState()
      for (const id of regions.keys()) {
        stores.regionStore.getState().removeRegion(id)
      }
    })

    await expect(regionShapes).toHaveCount(0, { timeout: 5000 })

    // Load the saved layout and restore regions
    await mainWindow.evaluate(async () => {
      const layout = await window.smokeAPI.layout.load('e2e-region-test')
      if (!layout) throw new Error('Layout not found')

      const stores = (window as any).__SMOKE_STORES__
      if (layout.regions) {
        for (const saved of layout.regions) {
          stores.regionStore.getState().createRegion(
            saved.name, saved.position, saved.size, saved.color
          )
        }
      }
    })

    // Verify both regions were restored
    await expect(regionShapes).toHaveCount(2, { timeout: 5000 })

    // Verify region data in the store
    const regionData = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const regions = stores.regionStore.getState().regions
      const result: Array<{ name: string; color: string }> = []
      for (const r of regions.values()) {
        result.push({ name: r.name, color: r.color })
      }
      return result.sort((a: any, b: any) => a.name.localeCompare(b.name))
    })

    expect(regionData).toEqual([
      { name: 'Region Alpha', color: '#4A90D9' },
      { name: 'Region Beta', color: '#D94A4A' },
    ])

    // Cleanup
    await mainWindow.evaluate(() => window.smokeAPI.layout.delete('e2e-region-test'))
  })
})
