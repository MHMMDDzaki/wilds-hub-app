// Mitigation Factor = 80 / (80 + D)
// Every 80 defense ≈ +150 effective HP at 150 base HP
export function mitigationFactor(defense: number): number {
  return 80 / (80 + defense)
}

export function effectiveHP(defense: number, baseHP = 150): number {
  return Math.round(baseHP / mitigationFactor(defense))
}
