import { useRef, useState, useEffect } from 'react'
import { idr } from '../lib/format'
import { formatShort } from '../lib/amount'

interface AmountTextProps {
  amount: number
  className?: string
  variant?: 'hero' | 'lg' | 'md'
  signed?: boolean
  style?: React.CSSProperties
}

export function AmountText({ amount, className = '', variant = 'md', signed = false, style }: AmountTextProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [short, setShort] = useState(false)

  const full = signed
    ? `${amount > 0 ? '+' : ''}${idr(amount)}`
    : idr(amount)
  const abbr = signed
    ? `${amount > 0 ? '+' : ''}${formatShort(amount)}`
    : formatShort(amount)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setShort(el.scrollWidth > el.clientWidth + 2)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [amount])

  const cls = variant === 'hero' ? 'num-hero' : variant === 'lg' ? 'num-lg' : 'num'

  return (
    <span
      ref={ref}
      className={`${cls} ${className}`}
      style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'block',
        ...style,
      }}
      title={full}
    >
      {short ? abbr : full}
    </span>
  )
}
