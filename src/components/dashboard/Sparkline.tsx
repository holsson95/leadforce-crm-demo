'use client'

import { useId } from 'react'

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
}

export function Sparkline({ data, width = 80, height = 32 }: SparklineProps) {
  const uid = useId()
  const gradId = `lf-spark-grad-${uid.replace(/:/g, '')}`

  if (data.length < 2) return null

  const max   = Math.max(...data, 1)
  const min   = Math.min(...data, 0)
  const range = max - min || 1
  const padX  = 2
  const padY  = 2
  const innerW = width - padX * 2
  const innerH = height - padY * 2

  const pts = data.map((v, i) => {
    const x = padX + (i / (data.length - 1)) * innerW
    const y = padY + innerH - ((v - min) / range) * innerH
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const linePath = `M ${pts.join(' L ')}`
  const areaPath = `${linePath} L ${(padX + innerW).toFixed(1)},${(padY + innerH).toFixed(1)} L ${padX},${(padY + innerH).toFixed(1)} Z`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible flex-shrink-0"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#f5a623" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f5a623" stopOpacity="0"    />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
      <path d={linePath} fill="none" stroke="#f5a623" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
