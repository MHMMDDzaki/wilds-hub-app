import { SHARPNESS_RAW, SHARPNESS_ELEMENT } from './sharpness'
import type { SharpnessColour } from './sharpness'

export function calcRaw(
  trueRaw: number,
  sharpness: SharpnessColour,
  motionValue = 1.0,
  hitzoneValue = 1.0,
): number {
  return Math.floor(trueRaw * SHARPNESS_RAW[sharpness] * motionValue * hitzoneValue)
}

export function calcElement(
  elementDisplay: number,
  sharpness: SharpnessColour,
  elementalMV = 1.0,
  elementalHitzone = 1.0,
): number {
  return Math.floor((elementDisplay / 10) * SHARPNESS_ELEMENT[sharpness] * elementalMV * elementalHitzone)
}

// Returns expected-value multiplier applied to raw damage
// critBoostLevel 0–3 maps to base (1.25×) and Critical Boost Lv1–3 (1.30/1.35/1.40×)
// Negative affinity: chance of feeble strike at 0.75×
export function affinityMultiplier(
  affinity: number,
  critBoostLevel: 0 | 1 | 2 | 3 = 0,
): number {
  const critMult = ([1.25, 1.30, 1.35, 1.40] as const)[critBoostLevel]
  if (affinity >= 0) return 1 + (affinity / 100) * (critMult - 1)
  return 1 + (affinity / 100) * 0.25  // affinity is negative → subtracts
}
