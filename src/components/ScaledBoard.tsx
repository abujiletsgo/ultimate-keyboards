import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  /** Natural (unscaled) pixel size of the board */
  width: number
  height: number
  /** Cap on upscaling for very wide containers */
  maxScale?: number
  children: ReactNode
}

/**
 * Scales a fixed-pixel keyboard board to fill its container's width,
 * reflowing the layout height and centering horizontally. Makes the
 * absolutely-positioned key grids responsive to window resizes.
 */
export default function ScaledBoard({ width, height, maxScale = 1.3, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [offsetX, setOffsetX] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (w: number) => {
      if (w <= 0) return
      const s = Math.min(maxScale, w / width)
      setScale(s)
      setOffsetX(Math.max(0, (w - width * s) / 2))
    }
    update(el.clientWidth)
    const ro = new ResizeObserver(entries => update(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [width, maxScale])

  return (
    <div ref={ref} style={{ width: '100%', height: height * scale, position: 'relative' }}>
      <div
        style={{
          width,
          height,
          position: 'absolute',
          top: 0,
          left: offsetX,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  )
}
