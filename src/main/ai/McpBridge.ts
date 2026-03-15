/**
 * McpBridge — lightweight HTTP server running in the Electron main process.
 *
 * The MCP server subprocess calls this bridge to execute Smoke tools
 * (spawn_terminal, read_terminal_output, etc.). Each request contains a
 * tool name and input; the bridge dispatches to the appropriate executor.
 *
 * Listens on 127.0.0.1 only — never exposed beyond localhost.
 */

import * as http from 'http'

export type ToolExecutor = (input: Record<string, unknown>) => Promise<string>

export class McpBridge {
  private server: http.Server | null = null
  private executors = new Map<string, ToolExecutor>()
  private _port = 0

  /** Register a tool executor by name. */
  registerExecutor(name: string, executor: ToolExecutor): void {
    this.executors.set(name, executor)
  }

  /** Register multiple executors from a Map. */
  registerExecutors(executors: Map<string, ToolExecutor>): void {
    for (const [name, executor] of executors) {
      this.executors.set(name, executor)
    }
  }

  /** Start the HTTP server and return the bound port. */
  async start(): Promise<number> {
    if (this.server) return this._port

    return new Promise<number>((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        if (req.method !== 'POST' || req.url !== '/tool') {
          res.writeHead(404)
          res.end('Not found')
          return
        }

        let body = ''
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        req.on('end', async () => {
          try {
            const { name, input } = JSON.parse(body) as {
              name: string
              input: Record<string, unknown>
            }

            const executor = this.executors.get(name)
            if (!executor) {
              res.writeHead(404)
              res.end(JSON.stringify({ error: `Unknown tool: ${name}` }))
              return
            }

            const result = await executor(input)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ result }))
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Tool execution failed'
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: message }))
          }
        })
      })

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        if (addr && typeof addr === 'object') {
          this._port = addr.port
          this.server = server
          resolve(this._port)
        } else {
          reject(new Error('Failed to bind McpBridge'))
        }
      })

      server.on('error', reject)
    })
  }

  /** The port the server is listening on (0 if not started). */
  get port(): number {
    return this._port
  }

  /** Stop the HTTP server. */
  async stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null
          this._port = 0
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}
