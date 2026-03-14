import { spawn as ptySpawn, IPty } from 'node-pty'
import { EventEmitter } from 'events'
import { existsSync } from 'fs'
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

export class PtyProcess extends EventEmitter {
  readonly id: string
  readonly pid: number
  private pty: IPty
  private exited = false

  constructor(options: PtyProcessOptions) {
    super()

    this.id = options.id
    const shell = options.shell || getDefaultShell()
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
    this.pty.write(data)
  }

  resize(cols: number, rows: number): void {
    if (this.exited) return
    this.pty.resize(cols, rows)
  }

  kill(): void {
    if (this.exited) return
    this.pty.kill()
  }
}
