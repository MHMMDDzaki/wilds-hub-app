// ── API resource types ─────────────────────────────────────────────────────

export interface Location {
  id: number
  name: string
  zoneCount: number
}

export interface Monster {
  id: number
  name: string
  kind: string       // "large" | "small"
  species: string
  description?: string
  baseHealth?: number
  locations: { id: number; name: string; zoneCount: number }[]
  elements: unknown[]
  weaknesses: {
    id: number
    element?: string
    kind: string
    level: number
    condition: string | null
  }[]
  ailments: { id: number; name: string }[]
  rewards: {
    id: number
    item: { id: number; name: string; description: string; rarity: number }
    conditions: {
      id: number
      kind: string      // "carve" | "target-reward" | "broken-part" | etc.
      rank: string      // "low" | "high" | "master"
      chance: number
      quantity: number
      part: string | null
    }[]
  }[]
  parts: {
    id: number
    name: string
    kind: string
    health: number
    kinsectEssence: string | null
    multipliers: {
      slash: number; blunt: number; pierce: number
      fire: number; water: number; thunder: number; ice: number; dragon: number
      stun: number
    }
  }[]
}

export interface Weapon {
  id: number
  name: string
  kind: string       // "great-sword" | "bow" | etc.
  rarity: number
  description?: string
  damage: { raw: number; display: number }
  affinity: number
  defenseBonus: number
  slots: number[]
  specials: {
    id: number
    element: string
    kind: string
    damage: { raw: number; display: number }
    hidden: boolean
  }[]
  skills: SkillLevel[]
  crafting: {
    craftable: boolean
    previous: { id: number; name: string } | null
    branches: { id: number }[]
    craftingMaterials: CraftingMaterial[]
    craftingZennyCost: number
    upgradeMaterials: CraftingMaterial[]
    upgradeZennyCost: number
  }
  series?: { id: number; name: string }
  coatings?: string[]
}

export interface ArmorPiece {
  id: number
  name: string
  kind: 'head' | 'chest' | 'arms' | 'waist' | 'legs'
  rank: string
  rarity: number
  defense: { base: number; max: number }
  resistances: { fire: number; water: number; thunder: number; ice: number; dragon: number }
  slots: number[]
  skills: SkillLevel[]
  armorSet?: { id: number; name: string }
  crafting?: {
    materials: CraftingMaterial[]
    zennyCost: number
  }
}

export interface ArmorSet {
  id: number
  name: string
}

export interface Skill {
  id: number
  name: string
  kind: string
  description: string
  maxLevel: number    // computed from ranks during seed
  ranks: {
    id: number
    level: number
    name: string | null
    description: string
    setPiecesRequired: number | null
  }[]
}

export interface Decoration {
  id: number
  name: string
  slot: number
  rarity: number
  skills: SkillLevel[]
}

export interface Charm {
  id: number
  name: string
}

export interface Item {
  id: number
  name: string
  description: string
  rarity: number
  carryLimit: number
  value?: number
}

// ── Shared sub-types ───────────────────────────────────────────────────────

export interface SkillLevel {
  skill: { id: number; name: string }
  level: number
}

export interface CraftingMaterial {
  quantity: number
  item: { id: number; name: string; rarity: number }
}

// ── User / derived types ───────────────────────────────────────────────────

export interface ActiveSkill {
  skillId: number
  name: string
  level: number
  cap: number
  overcapped: boolean
}

export type WeaponKind =
  | 'great-sword' | 'sword-shield' | 'dual-blades' | 'long-sword'
  | 'hammer' | 'hunting-horn' | 'lance' | 'gunlance'
  | 'switch-axe' | 'charge-blade' | 'insect-glaive'
  | 'light-bowgun' | 'heavy-bowgun' | 'bow'

export type ArtianAttr = 'Attack' | 'Affinity' | 'Element' | 'Defense' | null

export type Phase = 'Plenty' | 'Fallow' | 'Inclemency'
export type MonsterState = 'Normal' | 'Enraged' | 'Wounded'
export type ArmorSlot = 'head' | 'chest' | 'arms' | 'waist' | 'legs'

// ── Dexie user state types ─────────────────────────────────────────────────

export interface FavoriteEntry {
  id?: number
  kind: 'weapon' | 'armor' | 'decoration'
  entityId: number
  name: string
  addedAt: number
}

export interface FarmListItem {
  id?: number
  itemId: number
  itemName: string
  rarity: number
  totalNeeded: number
  current: number
  source: string | null
}

export interface UserTalisman {
  id?: number
  skills: { skillId: number; level: number }[]
  slots: number[]
  note?: string
}

export interface UserDecoEntry {
  id?: number
  decorationId: number
  quantity: number
}

export interface CalibratorSettings {
  id: 'global'
  contrast: number
  saturation: number
}
