/**
 * Smoke MCP Server — standalone process implementing MCP over stdio.
 *
 * Spawned by Claude Code as an MCP tool server.  Receives tool calls
 * via JSON-RPC 2.0 over stdin and forwards them to the Smoke McpBridge
 * HTTP endpoint.
 *
 * Uses only Node.js built-ins (http, readline) — no npm dependencies —
 * so it runs anywhere Node.js is available.
 *
 * Env vars:
 *   SMOKE_BRIDGE_PORT — port of the McpBridge HTTP server in the
 *                        Electron main process.
 *   SMOKE_AGENT_ID    — the agent ID, included in tool call metadata.
 */

import * as http from 'http'
import * as readline from 'readline'
import { toolDefs } from './toolDefs'

const BRIDGE_PORT = parseInt(process.env.SMOKE_BRIDGE_PORT || '0', 10)
const AGENT_ID = process.env.SMOKE_AGENT_ID || ''

if (!BRIDGE_PORT) {
  process.stderr.write('SMOKE_BRIDGE_PORT not set\n')
  process.exit(1)
}

// ── JSON-RPC helpers ──────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number
  method: string
  params?: Record<string, unknown>
}

function respond(id: string | number | undefined, result: unknown): void {
  if (id === undefined) return // notification — no response
  const msg = JSON.stringify({ jsonrpc: '2.0', id, result })
  process.stdout.write(msg + '\n')
}

function respondError(
  id: string | number | undefined,
  code: number,
  message: string
): void {
  if (id === undefined) return
  const msg = JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  })
  process.stdout.write(msg + '\n')
}

// ── Bridge HTTP client ────────────────────────────────────────────────

function callBridge(
  name: string,
  input: Record<string, unknown>
): Promise<{ result?: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ name, input, agentId: AGENT_ID })
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: BRIDGE_PORT,
        path: '/tool',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString()
        })
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as { result?: string; error?: string })
          } catch {
            resolve({ error: `Invalid bridge response: ${data}` })
          }
        })
      }
    )
    req.on('error', (err) => reject(err))
    req.write(body)
    req.end()
  })
}

// ── MCP message handler ──────────────────────────────────────────────

async function handleMessage(msg: JsonRpcRequest): Promise<void> {
  switch (msg.method) {
    case 'initialize':
      respond(msg.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'smoke-tools', version: '1.0.0' },
      })
      break

    case 'notifications/initialized':
      // Notification — no response needed
      break

    case 'tools/list':
      respond(msg.id, {
        tools: toolDefs.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      })
      break

    case 'tools/call': {
      const params = msg.params as { name: string; arguments?: Record<string, unknown> } | undefined
      if (!params?.name) {
        respondError(msg.id, -32602, 'Missing tool name')
        return
      }

      try {
        const bridgeResult = await callBridge(params.name, params.arguments ?? {})
        if (bridgeResult.error) {
          respond(msg.id, {
            content: [{ type: 'text', text: bridgeResult.error }],
            isError: true,
          })
        } else {
          respond(msg.id, {
            content: [{ type: 'text', text: bridgeResult.result ?? '' }],
          })
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Bridge call failed'
        respond(msg.id, {
          content: [{ type: 'text', text: message }],
          isError: true,
        })
      }
      break
    }

    case 'ping':
      respond(msg.id, {})
      break

    default:
      respondError(msg.id, -32601, `Method not found: ${msg.method}`)
  }
}

// ── Main loop — read NDJSON from stdin ────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, terminal: false })

rl.on('line', (line: string) => {
  if (!line.trim()) return
  try {
    const msg = JSON.parse(line) as JsonRpcRequest
    handleMessage(msg).catch((err) => {
      process.stderr.write(`MCP handler error: ${err}\n`)
    })
  } catch {
    process.stderr.write(`Invalid JSON: ${line}\n`)
  }
})

rl.on('close', () => {
  process.exit(0)
})
