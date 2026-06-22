import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { Overline, Panel, Pill, Segmented, Button, Icon } from '@/components/ui'
import type { FarmListItem, FavoriteEntry } from '@/types'

type Tab = 'FAVORITES' | 'MATERIALS' | 'LOADOUT'

async function rebuildFarmList(favs: FavoriteEntry[]) {
  const weaponIds = favs.filter(f => f.kind === 'weapon').map(f => f.entityId)
  const armorIds  = favs.filter(f => f.kind === 'armor').map(f => f.entityId)
  const [weapons, armors] = await Promise.all([
    db.weapons.where('id').anyOf(weaponIds).toArray(),
    db.armor.where('id').anyOf(armorIds).toArray(),
  ])
  const map = new Map<number, { itemName: string; rarity: number; qty: number }>()
  for (const w of weapons) {
    for (const m of [...(w.crafting?.craftingMaterials ?? []), ...(w.crafting?.upgradeMaterials ?? [])]) {
      const cur = map.get(m.item.id)
      if (cur) cur.qty += m.quantity
      else map.set(m.item.id, { itemName: m.item.name, rarity: m.item.rarity, qty: m.quantity })
    }
  }
  for (const a of armors) {
    for (const m of a.crafting?.materials ?? []) {
      const cur = map.get(m.item.id)
      if (cur) cur.qty += m.quantity
      else map.set(m.item.id, { itemName: m.item.name, rarity: m.item.rarity, qty: m.quantity })
    }
  }
  await db.transaction('rw', db.farmList, async () => {
    const existing = await db.farmList.toArray()
    const progress = new Map(existing.map(e => [e.itemId, e.current]))
    await db.farmList.clear()
    if (map.size > 0) {
      await db.farmList.bulkAdd(
        [...map.entries()].map(([itemId, v]) => ({
          itemId,
          itemName: v.itemName,
          rarity: v.rarity,
          totalNeeded: v.qty,
          current: progress.get(itemId) ?? 0,
          source: null,
        }))
      )
    }
  })
}

export function FavoritesScreen() {
  const [tab, setTab] = useState<Tab>('MATERIALS')

  const farmList  = useLiveQuery(() => db.farmList.toArray(),  [])
  const favorites = useLiveQuery(() => db.favorites.toArray(), [])

  useEffect(() => {
    if (favorites !== undefined) rebuildFarmList(favorites)
  }, [favorites])

  const allDone = (farmList?.length ?? 0) > 0 && farmList!.every(i => i.current >= i.totalNeeded)

  async function increment(item: FarmListItem) {
    if (item.current >= item.totalNeeded || item.id == null) return
    await db.farmList.update(item.id, { current: item.current + 1 })
  }

  async function decrement(item: FarmListItem) {
    if (item.current <= 0 || item.id == null) return
    await db.farmList.update(item.id, { current: item.current - 1 })
  }

  return (
    <div className="page">
      <div className="screen-head">
        <div>
          <Overline>Tracking</Overline>
          <div className="h2" style={{ marginTop: 4 }}>Favorites & Farming</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Segmented<Tab>
          options={['FAVORITES', 'MATERIALS', 'LOADOUT']}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'FAVORITES' && (
        <Panel title="Starred Items" icon="star">
          {!favorites || favorites.length === 0 ? (
            <div className="overline" style={{ textAlign: 'center', padding: '32px 0', color: 'var(--fg4)' }}>
              No favorites yet — star weapons or armor from the Equipment screen
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {favorites.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
                  <Icon name={f.kind === 'weapon' ? 'sword' : f.kind === 'armor' ? 'shield' : 'gem'} size={14} style={{ color: 'var(--fg3)' }} />
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg2)', flex: 1 }}>
                    {f.name}
                  </span>
                  <Pill kind="neutral">{f.kind}</Pill>
                  <button onClick={() => db.favorites.delete(f.id!)} style={{ background: 'none', border: 'none', color: 'var(--fg4)', cursor: 'pointer', padding: 4 }}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === 'MATERIALS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {allDone && (
            <div className="banner" style={{ background: 'rgba(16,185,129,.1)', borderColor: 'var(--success)', color: 'var(--success)', marginBottom: 8 }}>
              <Icon name="circle-check" size={14} />
              All materials gathered — ready to craft.
            </div>
          )}
          {!farmList || farmList.length === 0 ? (
            <Panel>
              <div className="overline" style={{ textAlign: 'center', padding: '32px 0', color: 'var(--fg4)' }}>
                No materials tracked — star weapons or armor to auto-aggregate
              </div>
            </Panel>
          ) : (
            farmList.map(item => {
              const pct     = Math.min((item.current / item.totalNeeded) * 100, 100)
              const done    = item.current >= item.totalNeeded
              const crit    = item.current === 0
              return (
                <Panel key={item.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--fg1)', flex: 1 }}>{item.itemName}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: done ? 'var(--success)' : 'var(--fg2)' }}>
                      {item.current}/{item.totalNeeded}
                    </span>
                    {crit && <Pill kind="crit" icon="octagon-alert">Critical</Pill>}
                    {done && <Pill kind="ok"   icon="circle-check">Goal Met</Pill>}
                  </div>
                  {item.source && (
                    <div style={{ fontSize: 12, color: 'var(--fg4)', marginBottom: 4 }}>
                      Source: {item.source}
                    </div>
                  )}
                  <div className="mat-bar">
                    <div className={`mat-bar-fill${done ? ' complete' : ''}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <Button variant="ghost" onClick={() => decrement(item)}>−</Button>
                    <Button variant="ghost" onClick={() => increment(item)}>+</Button>
                  </div>
                </Panel>
              )
            })
          )}
        </div>
      )}

      {tab === 'LOADOUT' && (
        <Panel title="Hunt Loadout" icon="backpack">
          <div className="overline" style={{ textAlign: 'center', padding: '32px 0', color: 'var(--fg4)' }}>
            Loadout checklist — coming soon
          </div>
        </Panel>
      )}
    </div>
  )
}
