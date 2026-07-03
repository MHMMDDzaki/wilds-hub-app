import Dexie, { type Table } from 'dexie'
import type {
  Monster, Weapon, ArmorPiece, ArmorSet, Charm, Decoration, Skill,
  Location, Item, FavoriteEntry, FarmListItem, UserTalisman, UserDecoEntry,
  CalibratorSettings, SavedSet,
} from '@/types'

class WildsHubDB extends Dexie {
  monsters!:    Table<Monster,    number>
  weapons!:     Table<Weapon,     number>
  armor!:       Table<ArmorPiece, number>
  armorSets!:   Table<ArmorSet,   number>
  charms!:      Table<Charm,      number>
  decorations!: Table<Decoration, number>
  skills!:      Table<Skill,      number>
  locations!:   Table<Location,   number>
  items!:       Table<Item,       number>

  favorites!:     Table<FavoriteEntry,     number>
  farmList!:      Table<FarmListItem,      number>
  userTalismans!: Table<UserTalisman,      number>
  userDecos!:     Table<UserDecoEntry,     number>
  calibrator!:    Table<CalibratorSettings, string>
  savedSets!:     Table<SavedSet,          number>

  _meta!: Table<{ key: string; value: string }, string>

  constructor() {
    super('WildsHubDB')

    this.version(1).stores({
      monsters:     '&id, name, kind, species',
      weapons:      '&id, name, kind, rarity',
      armor:        '&id, name, kind, rarity',
      armorSets:    '&id, name',
      charms:       '&id, name',
      decorations:  '&id, name, slot',
      skills:       '&id, name',
      locations:    '&id, name',
      items:        '&id, name',
      favorites:    '++id, kind, entityId',
      farmList:     '++id, itemId',
      userTalismans:'++id',
      userDecos:    '++id, decorationId',
      calibrator:   '&id',
      _meta:        '&key',
    })

    // v2: force re-seed (armor index kind vs type, version endpoint fix)
    this.version(2).stores({}).upgrade(tx =>
      tx.table('_meta').where('key').equals('apiVersion').delete()
    )

    // v3: UserTalisman shape changed (added rarity, TalismanSlot[] for slots)
    this.version(3).stores({}).upgrade(tx =>
      tx.table('userTalismans').clear()
    )

    // v5: Custom Set Builder — savedSets table (Spec 07)
    this.version(5).stores({
      savedSets: '++id, name, updatedAt',
    })

    // v4: R8 weapon slot was defaulting to size 0 — fix to size 1 (W1 always present)
    this.version(4).stores({}).upgrade(async tx => {
      const talismans = await tx.table('userTalismans').toArray()
      for (const t of talismans) {
        if (t.rarity !== 8) continue
        const fixed = t.slots.map((s: { type: string; size: number }) =>
          s.type === 'weapon' && s.size === 0 ? { ...s, size: 1 } : s
        )
        await tx.table('userTalismans').update(t.id, { slots: fixed })
      }
    })
  }
}

export const db = new WildsHubDB()
