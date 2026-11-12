export const TEXT_COLORS = ['default', 'gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple']
export const BACKGROUND_COLORS = [
  'none',
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'gray-strong',
  'red-strong',
  'orange-strong',
  'yellow-strong',
  'green-strong',
  'blue-strong',
  'purple-strong',
]
export const COLOR_VALUES = {
  gray: '#9ca3af',
  red: '#e76565',
  orange: '#d99238',
  yellow: '#c3ae35',
  green: '#61a96d',
  blue: '#648fda',
  purple: '#ac81d4',
}
export function colorStyle(color, background = false) {
  if (!color || color === 'none' || color === 'default') return undefined
  const base = color.replace('-strong', '')
  const value = COLOR_VALUES[base]
  return (
    value &&
    (background
      ? `color-mix(in srgb, ${value} ${color.endsWith('-strong') ? 65 : 22}%, transparent)`
      : value)
  )
}

export const INLINE_BACKGROUNDS = {
  gray: '#e5e7eb',
  red: '#fac5c5',
  orange: '#fbdcba',
  yellow: '#fff4a3',
  green: '#c8edce',
  blue: '#ccddfa',
  purple: '#e4d0fa',
  'gray-strong': '#9ca3af',
  'red-strong': '#ef6461',
  'orange-strong': '#ffa43b',
  'yellow-strong': '#f6e832',
  'green-strong': '#66cc70',
  'blue-strong': '#8aaff0',
  'purple-strong': '#bd99ed',
}
