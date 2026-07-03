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
  kind: 'weapon' | 'armor'
  skills: SkillLevel[]
}

export interface TalismanSlot {
  type: 'weapon' | 'armor'
  size: 0 | 1 | 2 | 3
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

export interface BuildPiece {
  id: number
  name: string
  kind: 'head' | 'chest' | 'arms' | 'waist' | 'legs'
  rarity: number
  armorSetId: number | null
  armorSetName: string | null
  defenseMax: number
  resistances: { fire: number; water: number; thunder: number; ice: number; dragon: number }
  slots: number[]
  skills: SkillLevel[]
}

export interface SetBonus {
  setId: number
  setName: string
  pieceCount: number
  activeThresholds: number[]
  skills: ActiveSkill[]
}

export interface BuildResult {
  pieces: BuildPiece[]
  skills: ActiveSkill[]
  totalDefense: number
  effectiveHP: number
  resistances: { fire: number; water: number; thunder: number; ice: number; dragon: number }
  setBonuses: SetBonus[]
  score: number
}

export type WeaponKind =
  | 'great-sword' | 'sword-shield' | 'dual-blades' | 'long-sword'
  | 'hammer' | 'hunting-horn' | 'lance' | 'gunlance'
  | 'switch-axe' | 'charge-blade' | 'insect-glaive'
  | 'light-bowgun' | 'heavy-bowgun' | 'bow'

export type ArtianAttr = 'Attack' | 'Affinity' | null

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
  rarity: 5 | 6 | 7 | 8
  skills: { skillId: number; level: number }[]
  slots: TalismanSlot[]
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

// ── Custom Set Builder ─────────────────────────────────────────────────────────

export interface DecoAssignment {
  pieceKey: 'weapon' | 'head' | 'chest' | 'arms' | 'waist' | 'legs' | 'talisman'
  slotIndex: number
  decorationId: number | null
}

export interface SavedSet {
  id?: number
  name: string
  weaponId: number | null
  gogmaSkillIds: number[]          // up to 2 Lord's Soul bonus skills
  artianAttr: ArtianAttr | null
  armorIds: {
    head:  number | null
    chest: number | null
    arms:  number | null
    waist: number | null
    legs:  number | null
  }
  talismanId: number | null        // references userTalismans.id
  decoAssignments: DecoAssignment[]
  createdAt: number
  updatedAt: number
}

// ── Community Gallery (Spec 06 / 07 Phase 3) ──────────────────────────────────

export interface CommunityBuild {
  id: string
  title: string
  weaponKind: string | null
  skills: { name: string; level: number }[]
  votes: number
  createdAt: string
  source: 'auto' | 'manual'
  payload?: unknown
}

export interface BuildSharePayload {
  title: string
  weaponKind?: string
  skills: { name: string; level: number }[]
  payload: unknown
  source: 'auto' | 'manual'
}
