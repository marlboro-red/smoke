/**
 * postMessage bridge protocol between the host (Smoke renderer) and
 * plugin iframes. All communication flows through structured messages
 * with a `__smoke_plugin` envelope to avoid collisions with other
 * postMessage traffic.
 */

import type { PluginManifest } from './pluginTypes'

// ─── Message envelope ─────────────────────────────────────────────

const PROTOCOL = '__smoke_plugin' as const

interface PluginMessage {
  protocol: typeof PROTOCOL
  sessionId: string
  direction: 'host-to-plugin' | 'plugin-to-host'
  type: string
  payload: unknown
}

function isPluginMessage(data: unknown): data is PluginMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as PluginMessage).protocol === PROTOCOL
  )
}

// ─── Host-side bridge (runs in the Smoke renderer) ────────────────

export type PluginMessageHandler = (type: string, payload: unknown) => void

export interface HostBridge {
  /** Send a message into the plugin iframe */
  send: (type: string, payload: unknown) => void
  /** Register a handler for messages from the plugin */
  onMessage: (handler: PluginMessageHandler) => () => void
  /** Initialize the plugin with its context */
  initialize: (manifest: PluginManifest, size: { width: number; height: number }) => void
  /** Notify the plugin of a resize */
  resize: (width: number, height: number) => void
  /** Tear down listeners */
  destroy: () => void
}

export function createHostBridge(
  iframe: HTMLIFrameElement,
  sessionId: string
): HostBridge {
  const handlers = new Set<PluginMessageHandler>()

  function handleMessage(event: MessageEvent): void {
    if (event.source !== iframe.contentWindow) return
    if (!isPluginMessage(event.data)) return
    if (event.data.sessionId !== sessionId) return
    if (event.data.direction !== 'plugin-to-host') return

    for (const handler of handlers) {
      handler(event.data.type, event.data.payload)
    }
  }

  window.addEventListener('message', handleMessage)

  function send(type: string, payload: unknown): void {
    iframe.contentWindow?.postMessage(
      {
        protocol: PROTOCOL,
        sessionId,
        direction: 'host-to-plugin',
        type,
        payload,
      } satisfies PluginMessage,
      '*'
    )
  }

  return {
    send,

    onMessage(handler: PluginMessageHandler): () => void {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },

    initialize(manifest: PluginManifest, size: { width: number; height: number }): void {
      send('__init', { manifest, sessionId, size })
    },

    resize(width: number, height: number): void {
      send('__resize', { width, height })
    },

    destroy(): void {
      window.removeEventListener('message', handleMessage)
      handlers.clear()
    },
  }
}

// ─── Plugin-side bridge (runs inside the iframe) ──────────────────

/**
 * Returns the JavaScript source that runs inside the sandboxed iframe.
 * It sets up the plugin-side of the postMessage bridge and exposes
 * a `PluginContext` object the plugin code can use.
 */
export function getPluginBootstrapSource(): string {
  return `
(function() {
  'use strict';

  var PROTOCOL = '${PROTOCOL}';
  var sessionId = null;
  var manifest = null;
  var size = { width: 0, height: 0 };
  var messageHandlers = {};
  var readyCallback = null;

  // Send a message to the host
  function sendToHost(type, payload) {
    window.parent.postMessage({
      protocol: PROTOCOL,
      sessionId: sessionId,
      direction: 'plugin-to-host',
      type: type,
      payload: payload
    }, '*');
  }

  // The PluginContext exposed to plugin code
  var pluginContext = {
    get sessionId() { return sessionId; },
    get manifest() { return manifest; },
    get size() { return { width: size.width, height: size.height }; },

    setTitle: function(title) {
      sendToHost('__setTitle', { title: title });
    },

    requestResize: function(width, height) {
      sendToHost('__requestResize', { width: width, height: height });
    },

    storage: {
      get: function(key) {
        return new Promise(function(resolve) {
          var reqId = Math.random().toString(36).slice(2);
          var handler = function(payload) {
            if (payload && payload.reqId === reqId) {
              delete messageHandlers['__storage:result:' + reqId];
              resolve(payload.value);
            }
          };
          messageHandlers['__storage:result:' + reqId] = [handler];
          sendToHost('__storage:get', { key: key, reqId: reqId });
        });
      },
      set: function(key, value) {
        return new Promise(function(resolve) {
          var reqId = Math.random().toString(36).slice(2);
          var handler = function() {
            delete messageHandlers['__storage:result:' + reqId];
            resolve();
          };
          messageHandlers['__storage:result:' + reqId] = [handler];
          sendToHost('__storage:set', { key: key, value: value, reqId: reqId });
        });
      },
      delete: function(key) {
        return new Promise(function(resolve) {
          var reqId = Math.random().toString(36).slice(2);
          var handler = function() {
            delete messageHandlers['__storage:result:' + reqId];
            resolve();
          };
          messageHandlers['__storage:result:' + reqId] = [handler];
          sendToHost('__storage:delete', { key: key, reqId: reqId });
        });
      }
    },

    sendMessage: function(type, payload) {
      sendToHost('plugin:' + type, payload);
    },

    onMessage: function(type, handler) {
      var key = 'plugin:' + type;
      if (!messageHandlers[key]) messageHandlers[key] = [];
      messageHandlers[key].push(handler);
      return function() {
        var arr = messageHandlers[key];
        if (arr) {
          var idx = arr.indexOf(handler);
          if (idx !== -1) arr.splice(idx, 1);
        }
      };
    }
  };

  // Listen for messages from the host
  window.addEventListener('message', function(event) {
    if (!event.data || event.data.protocol !== PROTOCOL) return;
    if (event.data.direction !== 'host-to-plugin') return;

    var type = event.data.type;
    var payload = event.data.payload;

    if (type === '__init') {
      sessionId = payload.sessionId;
      manifest = payload.manifest;
      size = payload.size || size;
      if (readyCallback) readyCallback(pluginContext);
      sendToHost('__ready', {});
      return;
    }

    if (type === '__resize') {
      size = { width: payload.width, height: payload.height };
      return;
    }

    // Dispatch to registered handlers
    var handlers = messageHandlers[type];
    if (handlers) {
      for (var i = 0; i < handlers.length; i++) {
        try { handlers[i](payload); } catch(e) {
          console.error('[Plugin] Handler error:', e);
          sendToHost('__error', { message: e.message, stack: e.stack, phase: 'runtime' });
        }
      }
    }
  });

  // Global error handler — report uncaught errors to host
  window.addEventListener('error', function(event) {
    sendToHost('__error', {
      message: event.message,
      stack: event.error ? event.error.stack : null,
      phase: 'runtime'
    });
  });

  window.addEventListener('unhandledrejection', function(event) {
    var reason = event.reason;
    sendToHost('__error', {
      message: reason && reason.message ? reason.message : String(reason),
      stack: reason && reason.stack ? reason.stack : null,
      phase: 'runtime'
    });
  });

  // Expose to the plugin code
  window.__smokePlugin = {
    onReady: function(callback) { readyCallback = callback; },
    context: pluginContext
  };
})();
`
}

/**
 * Build the full HTML document injected into the sandbox iframe.
 * The plugin code is loaded after the bootstrap bridge is set up.
 */
export function buildSandboxHtml(pluginSource: string): string {
  const bootstrap = getPluginBootstrapSource()
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:;">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    color: #e0e0e0;
    background: transparent;
  }
  #plugin-root { width: 100%; height: 100%; }
</style>
</head>
<body>
<div id="plugin-root"></div>
<script>${bootstrap}</script>
<script>${pluginSource}</script>
</body>
</html>`
}
