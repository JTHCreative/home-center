import { useRef } from 'react'

// Mouse press-and-drag scrolling for an overflow container (grab to pan).
// Touch is left to native scrolling. Spread `handlers` on the scrollable element
// and attach `ref`; a real drag suppresses the trailing click so buttons inside
// don't fire when you were only scrolling.
export function useDragScroll() {
  const ref = useRef(null)
  const state = useRef({ active: false, moved: false, x: 0, y: 0, left: 0, top: 0 })

  const onPointerDown = (e) => {
    if (e.pointerType === 'touch') return // native touch scroll handles this
    const el = ref.current
    if (!el) return
    state.current = {
      active: true,
      moved: false,
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
    }
  }
  const onPointerMove = (e) => {
    const s = state.current
    if (!s.active || !ref.current) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) s.moved = true
    ref.current.scrollTop = s.top - dy
    ref.current.scrollLeft = s.left - dx
  }
  const end = () => {
    state.current.active = false
  }
  const onClickCapture = (e) => {
    if (state.current.moved) {
      e.stopPropagation()
      e.preventDefault()
      state.current.moved = false
    }
  }

  return {
    ref,
    handlers: { onPointerDown, onPointerMove, onPointerUp: end, onPointerLeave: end, onClickCapture },
  }
}
