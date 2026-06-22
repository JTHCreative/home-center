import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts'

// Compact price sparkline. `data` is an array of numbers.
export default function Sparkline({ data = [], up = true, width = 120, height = 40 }) {
  const points = data.map((v, i) => ({ i, v }))

  if (points.length < 2) {
    return <div style={{ width, height }} />
  }

  // Draw the line in the same gain/loss tokens the change / net-chg figures use
  // (via `currentColor`), so the chart color always matches the numbers.
  return (
    <div style={{ width, height, color: up ? 'rgb(var(--c-gain))' : 'rgb(var(--c-loss))' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line
            type="monotone"
            dataKey="v"
            stroke="currentColor"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
