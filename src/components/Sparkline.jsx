import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts'

// Compact price sparkline. `data` is an array of numbers.
// Gain/loss hex, kept in sync with the bright --c-gain / --c-loss tokens used by
// the change / net-chg figures so the chart color matches the numbers.
const GAIN_HEX = '#39D353'
const LOSS_HEX = '#F85149'

export default function Sparkline({ data = [], up = true, width = 120, height = 40 }) {
  const points = data.map((v, i) => ({ i, v }))
  const color = up ? GAIN_HEX : LOSS_HEX

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
