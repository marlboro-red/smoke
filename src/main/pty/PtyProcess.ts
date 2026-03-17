import { spawn as ptySpawn, IPty } from 'node-pty'
import { EventEmitter } from 'events'
import { existsSync } from 'fs'
import { homedir } from 'os'
import * as path from 'path'

export interface PtyProcessOptions {
  id: string
  cwd: string
  shell?: string
  args?: string[]
  env?: Record<string, string>
  cols?: number
  rows?: number
}

function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

/**
 * Resolve a shell command name to a full path by searching PATH.
 * On Windows, also considers PATHEXT extensions (e.g. .exe, .cmd).
 */
function findOnPath(name: string): string | null {
  const pathDirs = (process.env.PATH || '').split(path.delimiter)
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')
    : ['']

  for (const dir of pathDirs) {
    const fullPath = path.join(dir, name)
    if (existsSync(fullPath)) return fullPath

    // On Windows, try PATHEXT extensions if the name lacks one
    if (process.platform === 'win32' && !path.extname(name)) {
      for (const ext of extensions) {
        const withExt = path.join(dir, name + ext)
        if (existsSync(withExt)) return withExt
      }
    }
  }
  return null
}

function resolveShell(requested?: string): string {
  if (!requested) return getDefaultShell()

  // Absolute path — check it exists directly
  if (path.isAbsolute(requested)) {
    return existsSync(requested) ? requested : getDefaultShell()
  }

  // Bare name — resolve via PATH
  const found = findOnPath(requested)
  return found || getDefaultShell()
}

export class PtyProcess extends EventEmitter {
  readonly id: string
  readonly pid: number
  private pty: IPty
  private exited = false

  constructor(options: PtyProcessOptions) {
    super()

    this.id = options.id
    const shell = resolveShell(options.shell)
    const args = options.args || []
    const cols = options.cols ?? 80
    const rows = options.rows ?? 24

    const cwd = existsSync(options.cwd) ? options.cwd : homedir()

    this.pty = ptySpawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: { ...process.env, ...options.env } as Record<string, string>
    })

    this.pid = this.pty.pid

    this.pty.onData((data: string) => {
      this.emit('data', data)
    })

    this.pty.onExit(({ exitCode, signal }) => {
      this.exited = true
      this.emit('exit', exitCode, signal)
    })
  }

  write(data: string): void {
    if (this.exited) return
    try {
      this.pty.write(data)
    } catch {
      // Process may have exited between check and write
    }
  }

  resize(cols: number, rows: number): void {
    if (this.exited) return
    try {
      this.pty.resize(cols, rows)
    } catch {
      // Process may have exited between check and resize
    }
  }

  kill(): void {
    if (this.exited) return
    try {
      this.pty.kill()
    } catch {
      // Process may have already been killed externally
    }
  }

  /**
   * Kill the PTY process immediately. The UI has already been removed,
   * so there is no need for a graceful shell exit.
   */
  gracefulKill(): void {
    this.kill()
  }

  pause(): void {
    if (this.exited) return
    try {
      this.pty.pause()
    } catch {
      // Process may have exited between check and pause
    }
  }

  resume(): void {
    if (this.exited) return
    try {
      this.pty.resume()
    } catch {
      // Process may have exited between check and resume
    }
  }
}
