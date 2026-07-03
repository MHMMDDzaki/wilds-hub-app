export type SharpnessColour = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'white' | 'violet'

export const SHARPNESS_COLOURS: SharpnessColour[] = ['red', 'orange', 'yellow', 'green', 'blue', 'white', 'violet']

export const SHARPNESS_RAW: Record<SharpnessColour, number> = {
  red:    0.50,
  orange: 0.75,
  yellow: 1.00,
  green:  1.05,
  blue:   1.20,
  white:  1.32,
  violet: 1.39,
}

export const SHARPNESS_ELEMENT: Record<SharpnessColour, number> = {
  red:    0.25,
  orange: 0.50,
  yellow: 0.75,
  green:  1.00,
  blue:   1.06,
  white:  1.125,
  violet: 1.25,
}

export const SHARPNESS_HEX: Record<SharpnessColour, string> = {
  red:    '#ef4444',
  orange: '#f97316',
  yellow: '#facc15',
  green:  '#22c55e',
  blue:   '#3b82f6',
  white:  '#e2e8f0',
  violet: '#a855f7',
}

// ponytail: rarity-based estimate — real sharpness bar not exposed by API
export function peakSharpness(rarity: number): SharpnessColour {
  if (rarity >= 8) return 'violet'
  if (rarity >= 7) return 'white'
  if (rarity >= 6) return 'blue'
  if (rarity >= 5) return 'green'
  return 'yellow'
}

export function sharpnessSegments(rarity: number): number[] {
  if (rarity >= 8) return [10, 10, 15, 20, 25, 25, 15]
  if (rarity >= 7) return [10, 10, 20, 30, 35, 15,  0]
  if (rarity >= 5) return [15, 15, 30, 40, 20,  0,  0]
  return                   [20, 25, 40, 15,  0,  0,  0]
}
