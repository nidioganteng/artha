import { useCallback, useRef, useState } from 'react'

/**
 * Callback-ref hook: mengukur lebar kontainer dan memperbaruinya via ResizeObserver.
 *
 * Keunggulan vs useRef + useEffect([ref]):
 * - Callback ref dipanggil setiap kali elemen di-mount/unmount ke DOM,
 *   sehingga aman dipakai pada elemen yang dirender secara kondisional.
 * - Tidak bergantung pada referensi objek ref yang tidak pernah berubah.
 *
 * Penggunaan:
 *   const [W, elRef] = useContainerWidth()
 *   <div ref={elRef} ...>
 */
export function useContainerWidth(): [number, (el: HTMLDivElement | null) => void] {
  const [width, setWidth] = useState(0)
  const roRef = useRef<ResizeObserver | null>(null)

  const callbackRef = useCallback((el: HTMLDivElement | null) => {
    // Bersihkan observer lama bila elemen di-unmount atau diganti
    if (roRef.current) {
      roRef.current.disconnect()
      roRef.current = null
    }
    if (!el) return

    // Ukur langsung saat elemen tersedia (callback ref dipanggil setelah layout)
    const w = el.getBoundingClientRect().width
    if (w > 0) setWidth(w)

    // Perbarui bila ukuran berubah (resize jendela, perubahan layout)
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cw = entry.contentRect.width
        if (cw > 0) setWidth(cw)
      }
    })
    ro.observe(el)
    roRef.current = ro
  }, [])

  return [width, callbackRef]
}
