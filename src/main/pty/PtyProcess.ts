import { spawn as ptySpawn, IPty } from 'node-pty'
import { EventEmitter } from 'events'
import { existsSync, accessSync, constants } from 'fs'
import { homedir } from 'os'

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

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function resolveShell(requested?: string): string {
  if (requested && isExecutable(requested)) {
    return requested
  }
  return getDefaultShell()
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
   * Gracefully close the PTY: write `exit` to the shell, wait briefly for a
   * clean exit, then force-kill if still alive.
   */
  gracefulKill(): void {
    if (this.exited) return

    // Try sending `exit` to the shell for a clean exit (code 0)
    try {
      this.pty.write('exit\r')
    } catch {
      // Shell might not accept input — fall through to force kill
    }

    // If the process hasn't exited after 300ms, force kill
    const timer = setTimeout(() => {
      this.kill()
    }, 300)

    this.once('exit', () => {
      clearTimeout(timer)
    })
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
