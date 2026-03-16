import { PtyProcess, PtyProcessOptions } from './PtyProcess'

export class PtyManager {
  private processes = new Map<string, PtyProcess>()
  private userInitiatedKills = new Set<string>()

  spawn(options: PtyProcessOptions): PtyProcess {
    const pty = new PtyProcess(options)
    this.processes.set(pty.id, pty)

    pty.on('exit', () => {
      this.processes.delete(pty.id)
    })

    return pty
  }

  get(id: string): PtyProcess | undefined {
    return this.processes.get(id)
  }

  write(id: string, data: string): void {
    this.processes.get(id)?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    this.processes.get(id)?.resize(cols, rows)
  }

  kill(id: string): void {
    this.processes.get(id)?.kill()
  }

  gracefulKill(id: string): void {
    this.userInitiatedKills.add(id)
    this.processes.get(id)?.gracefulKill()
  }

  isUserInitiatedKill(id: string): boolean {
    return this.userInitiatedKills.has(id)
  }

  clearUserInitiatedKill(id: string): void {
    this.userInitiatedKills.delete(id)
  }

  killAll(): void {
    for (const pty of this.processes.values()) {
      pty.kill()
    }
    this.processes.clear()
  }
}
