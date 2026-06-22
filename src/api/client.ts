import type { Monster, Weapon, ArmorPiece, ArmorSet, Charm, Decoration, Skill, Location, Item } from '@/types'
import { db } from '@/db'

const BASE    = import.meta.env.VITE_API_BASE
const VER_URL = import.meta.env.VITE_API_VERSION_URL

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`)
  return res.json()
}

export async function seedDB(): Promise<void> {
  try {
    const ver = await fetch(VER_URL).then(r => r.json()) as { version: string }
    const cached = await db._meta.get('apiVersion')
    if (cached?.value === ver.version) return

    const [monsters, weapons, armor, armorSets, charms, decorations, skills, locations, items] =
      await Promise.all([
        get<Monster[]>('/monsters'),
        get<Weapon[]>('/weapons'),
        get<ArmorPiece[]>('/armor'),
        get<ArmorSet[]>('/armor/sets'),
        get<Charm[]>('/charms'),
        get<Decoration[]>('/decorations'),
        get<Skill[]>('/skills'),
        get<Location[]>('/locations'),
        get<Item[]>('/items'),
      ])

    // Compute maxLevel from ranks (not in API response)
    for (const s of skills) {
      s.maxLevel = s.ranks.length > 0 ? Math.max(...s.ranks.map(r => r.level)) : 1
    }

    await db.transaction('rw',
      [db.monsters, db.weapons, db.armor, db.armorSets, db.charms,
       db.decorations, db.skills, db.locations, db.items, db._meta],
      async () => {
        await Promise.all([
          db.monsters.bulkPut(monsters),
          db.weapons.bulkPut(weapons),
          db.armor.bulkPut(armor),
          db.armorSets.bulkPut(armorSets),
          db.charms.bulkPut(charms),
          db.decorations.bulkPut(decorations),
          db.skills.bulkPut(skills),
          db.locations.bulkPut(locations),
          db.items.bulkPut(items),
          db._meta.put({ key: 'apiVersion', value: ver.version }),
        ])
      }
    )
  } catch (err) {
    console.warn('[WildsHub] seedDB failed — running on cached data', err)
  }
}

export const api = {
  monster: (id: number) => get<Monster>(`/monsters/${id}`),
  weapon:  (id: number) => get<Weapon>(`/weapons/${id}`),
  armor:   (id: number) => get<ArmorPiece>(`/armor/${id}`),
}
