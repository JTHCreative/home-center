import { Cell, Pie, PieChart } from 'recharts'

// Completion summary ring built on Recharts. `value` is 0–100.
export default function ProgressRing({ value = 0, size = 120, label }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  const data = [
    { name: 'done', value: pct },
    { name: 'rest', value: 100 - pct },
  ]
  const radius = size / 2

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          dataKey="value"
          innerRadius={radius - 12}
          outerRadius={radius}
          startAngle={90}
          endAngle={-270}
          stroke="none"
          isAnimationActive={false}
        >
          <Cell fill="#39D353" />
          <Cell fill="#30363D" />
        </Pie>
      </PieChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-2xl font-bold text-white">{pct}%</span>
        {label && <span className="text-xs text-gray-400">{label}</span>}
      </div>
    </div>
  )
}
