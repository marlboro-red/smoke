import { describe, it, expect } from 'vitest'
import { buildSandboxHtml, getPluginBootstrapSource } from '../pluginBridge'

// ─── buildSandboxHtml ─────────────────────────────────────────────

describe('buildSandboxHtml', () => {
  it('returns valid HTML with doctype', () => {
    const html = buildSandboxHtml('console.log("hi")')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<html>')
    expect(html).toContain('</html>')
  })

  it('includes Content-Security-Policy meta tag', () => {
    const html = buildSandboxHtml('')
    expect(html).toContain('Content-Security-Policy')
    expect(html).toContain("default-src 'none'")
  })

  it('restricts CSP to inline scripts and styles only', () => {
    const html = buildSandboxHtml('')
    expect(html).toContain("script-src 'unsafe-inline'")
    expect(html).toContain("style-src 'unsafe-inline'")
  })

  it('allows data: and blob: image sources', () => {
    const html = buildSandboxHtml('')
    expect(html).toContain('img-src data: blob:')
  })

  it('includes the plugin source in a script tag', () => {
    const src = 'window.myPlugin = { version: "1.0" };'
    const html = buildSandboxHtml(src)
    expect(html).toContain(`<script>${src}</script>`)
  })

  it('includes the bootstrap bridge source before plugin source', () => {
    const pluginSrc = '/* PLUGIN CODE */'
    const html = buildSandboxHtml(pluginSrc)
    const bootstrapIdx = html.indexOf('__smoke_plugin')
    const pluginIdx = html.indexOf(pluginSrc)
    expect(bootstrapIdx).toBeGreaterThan(-1)
    expect(pluginIdx).toBeGreaterThan(bootstrapIdx)
  })

  it('includes a #plugin-root container', () => {
    const html = buildSandboxHtml('')
    expect(html).toContain('id="plugin-root"')
  })

  it('sets up basic styling with transparent background', () => {
    const html = buildSandboxHtml('')
    expect(html).toContain('background: transparent')
    expect(html).toContain('box-sizing: border-box')
  })
})

// ─── getPluginBootstrapSource ─────────────────────────────────────

describe('getPluginBootstrapSource', () => {
  it('returns a JavaScript IIFE string', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain('(function()')
    expect(src).toContain("'use strict'")
  })

  it('defines the __smoke_plugin protocol constant', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain("var PROTOCOL = '__smoke_plugin'")
  })

  it('sets up the __smokePlugin global with onReady and context', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain('window.__smokePlugin')
    expect(src).toContain('onReady')
    expect(src).toContain('context: pluginContext')
  })

  it('exposes sessionId, manifest, and size as getters', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain('get sessionId()')
    expect(src).toContain('get manifest()')
    expect(src).toContain('get size()')
  })

  it('includes setTitle method that sends __setTitle to host', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain('setTitle')
    expect(src).toContain("sendToHost('__setTitle'")
  })

  it('includes requestResize method that sends __requestResize to host', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain('requestResize')
    expect(src).toContain("sendToHost('__requestResize'")
  })

  it('includes storage API with get, set, and delete', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain('storage:')
    expect(src).toContain("sendToHost('__storage:get'")
    expect(src).toContain("sendToHost('__storage:set'")
    expect(src).toContain("sendToHost('__storage:delete'")
  })

  it('storage methods use Promise-based request/response pattern', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain('new Promise')
    expect(src).toContain('reqId')
    expect(src).toContain('__storage:result')
  })

  it('includes sendMessage that prefixes type with plugin:', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain('sendMessage')
    expect(src).toContain("'plugin:' + type")
  })

  it('includes onMessage that registers handlers with plugin: prefix', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain('onMessage')
    // onMessage also uses the plugin: prefix for handler keys
    expect(src).toContain("var key = 'plugin:' + type")
  })

  it('handles __init message to set sessionId, manifest, and size', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain("type === '__init'")
    expect(src).toContain('sessionId = payload.sessionId')
    expect(src).toContain('manifest = payload.manifest')
    expect(src).toContain('size = payload.size')
  })

  it('sends __ready message after initialization', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain("sendToHost('__ready', {})")
  })

  it('handles __resize message to update size', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain("type === '__resize'")
    expect(src).toContain('width: payload.width')
    expect(src).toContain('height: payload.height')
  })

  it('registers global error handler', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain("addEventListener('error'")
    expect(src).toContain("sendToHost('__error'")
  })

  it('registers global unhandled rejection handler', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain("addEventListener('unhandledrejection'")
  })

  it('reports errors with message, stack, and phase', () => {
    const src = getPluginBootstrapSource()
    // Error reports should include message, stack, and phase
    expect(src).toContain('message:')
    expect(src).toContain('stack:')
    expect(src).toContain("phase: 'runtime'")
  })

  it('uses postMessage to communicate with parent window', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain('window.parent.postMessage')
    expect(src).toContain("direction: 'plugin-to-host'")
  })

  it('filters incoming messages by protocol and direction', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain('event.data.protocol !== PROTOCOL')
    expect(src).toContain("event.data.direction !== 'host-to-plugin'")
  })

  it('catches and reports handler errors', () => {
    const src = getPluginBootstrapSource()
    expect(src).toContain('try { handlers[i](payload); } catch(e)')
    expect(src).toContain('[Plugin] Handler error')
  })
})
