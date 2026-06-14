import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts'

// Compact price sparkline. `data` is an array of numbers.
export default function Sparkline({ data = [], up = true, width = 120, height = 40 }) {
  const points = data.map((v, i) => ({ i, v }))
  const color = up ? '#39D353' : '#F85149'

  if (points.length < 2) {
    return <div style={{ width, height }} />
  }

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
