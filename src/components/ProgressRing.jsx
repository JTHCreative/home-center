import { Cell, Pie, PieChart } from 'recharts'

// Completion summary ring built on Recharts. `value` is 0–100.
export default function ProgressRing({ value = 0, size = 120, label, color = '#39D353' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  const data = [
    { name: 'done', value: pct },
    { name: 'rest', value: 100 - pct },
  ]
  const radius = size / 2
  const thickness = size >= 90 ? 12 : 7
  const numberClass = size >= 90 ? 'text-2xl' : 'text-xs'

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          dataKey="value"
          innerRadius={radius - thickness}
          outerRadius={radius}
          startAngle={90}
          endAngle={-270}
          stroke="none"
          isAnimationActive={false}
        >
          <Cell fill={color} />
          <Cell fill="#30363D" />
        </Pie>
      </PieChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-mono font-bold text-white ${numberClass}`}>{pct}%</span>
        {label && <span className="text-xs text-gray-400">{label}</span>}
      </div>
    </div>
  )
}
