import type { HidHandle } from '../../src/lib/device/bridge'

/**
 * Minimal VIA/Vial firmware emulator: answers the raw HID commands the
 * clients send, with the byte layouts of qmk quantum/via.c.
 */
export class FakeRawHid implements HidHandle {
  id = 0
  sent: number[][] = []
  lighting = new Map<string, number[]>([['3:1', [120]], ['3:2', [4]], ['3:3', [128]], ['3:4', [10, 255]]])
  /** VialRGB mode lo, mode hi, speed, h, s, v */
  vialRgb = [2, 0, 100, 20, 200, 150]
  constructor(
    public matrix: number[][][],
    public viaProtocol = 0x000c,
    public vialProtocol: number | null = null,
    public opts: { ignoreWrites?: boolean } = {},
  ) {}
  get rows() { return this.matrix[0].length }
  get cols() { return this.matrix[0][0].length }
  async transact(report: ArrayLike<number>): Promise<Uint8Array> {
    const r = Array.from(report)
    this.sent.push(r)
    const out = new Array(32).fill(0)
    r.forEach((b, i) => { out[i] = b })
    switch (r[0]) {
      case 0x01: out[1] = this.viaProtocol >> 8; out[2] = this.viaProtocol & 0xff; break
      case 0x11: out[1] = this.matrix.length; break
      case 0x12: {
        const off = (r[1] << 8) | r[2]
        const flat = this.matrix.flat(2).flatMap(k => [k >> 8, k & 0xff])
        for (let i = 0; i < r[3]; i++) out[4 + i] = flat[off + i] ?? 0
        break
      }
      case 0x04: { const k = this.matrix[r[1]][r[2]][r[3]]; out[4] = k >> 8; out[5] = k & 0xff; break }
      case 0x05: if (!this.opts.ignoreWrites) this.matrix[r[1]][r[2]][r[3]] = (r[4] << 8) | r[5]; break
      case 0x08:
        if (r[1] === 0x41) { this.vialRgb.forEach((b, i) => { out[2 + i] = b }); break }
        (this.lighting.get(`${r[1]}:${r[2]}`) ?? []).forEach((b, i) => { out[3 + i] = b }); break
      case 0x07:
        if (r[1] === 0x41) { if (!this.opts.ignoreWrites) this.vialRgb = r.slice(2, 8); break }
        if (!this.opts.ignoreWrites) this.lighting.set(`${r[1]}:${r[2]}`, r.slice(3, r[2] === 4 ? 5 : 4)); break
      case 0x09: break
      case 0xfe:
        if (this.vialProtocol === null) { out[0] = 0xff; break }
        if (r[1] === 0x00) {
          const v = this.vialProtocol
          out.splice(0, 12, v & 0xff, (v >> 8) & 0xff, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8)
        }
        break
      default: out[0] = 0xff
    }
    return Uint8Array.from(out)
  }
  async close() {}
}

