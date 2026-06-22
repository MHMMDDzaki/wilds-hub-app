export interface RegionMap {
  locationId: string
  apiId: number       // matches Location.id from API
  accent: string
  img: string
  camp: { x: number; y: number; label: string }
  danger: string[]   // SVG polygon paths, viewBox 0 0 1000 1000
}

// MVP: 2 biomes. Add remaining 3 in post-launch data update.
export const REGION_MAPS: RegionMap[] = [
  {
    locationId: 'windward-plains',
    apiId: 2,
    accent: '#e0a458',
    img: '/assets/windward_plains.jpg',
    camp: { x: 500, y: 500, label: 'BASE CAMP' },
    danger: ['M620,120 L880,180 L840,420 L600,360 Z', 'M120,560 L360,520 L420,780 L160,840 Z'],
  },
  {
    locationId: 'scarlet-forest',
    apiId: 3,
    accent: '#d9466a',
    img: '/assets/scarlet_forest.jpg',
    camp: { x: 360, y: 600, label: 'POP-UP 1' },
    danger: ['M520,180 L820,140 L880,400 L560,460 Z', 'M180,640 L420,700 L380,900 L140,860 Z'],
  },
  // deferred: oilwell-basin (1), iceshard-cliffs (5), ruins-of-wyveria (4)
]

export const REGION_MAP_INDEX = new Map(REGION_MAPS.map(r => [r.locationId, r]))

export function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// Hardcoded apex IDs until API exposes threat tier
export const APEX_NAMES = new Set([
  'Rey Dau', 'Jin Dahaad', 'Nu Udra', 'Uth Duna', 'Arkveld',
])
