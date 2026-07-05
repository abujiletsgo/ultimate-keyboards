export class ChordDetector {
  private heldKeys = new Set<string>()
  private chord = new Set<string>()
  private timer: number | null = null

  constructor(
    private windowMs: number,
    private onChord: (chord: Set<string>) => void,
    private onUpdate: (current: Set<string>) => void
  ) {}

  handleKeyDown(key: string): void {
    // Only handle single lowercase letters [a-z]
    if (!/^[a-z]$/.test(key)) return

    this.heldKeys.add(key)
    this.chord.add(key)
    this.onUpdate(new Set(this.chord))

    // Reset timer each time a new key is pressed
    if (this.timer !== null) {
      clearTimeout(this.timer)
    }
    this.timer = window.setTimeout(() => {
      this.emit()
    }, this.windowMs)
  }

  handleKeyUp(key: string): void {
    this.heldKeys.delete(key)

    // If all keys released and we have a chord, emit immediately
    if (this.heldKeys.size === 0 && this.chord.size > 0) {
      if (this.timer !== null) {
        clearTimeout(this.timer)
        this.timer = null
      }
      this.emit()
    }
  }

  private emit(): void {
    if (this.chord.size === 0) return
    const fired = new Set(this.chord)
    this.chord.clear()
    this.timer = null
    this.onChord(fired)
    this.onUpdate(new Set())
  }

  setWindowMs(ms: number): void {
    this.windowMs = ms
  }

  destroy(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
