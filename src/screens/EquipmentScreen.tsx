import { useState, useMemo, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { Overline, Panel, Segmented, StatTile, EquipIcon, Icon, Pill } from '@/components/ui'
import type { WeaponKind, ArtianAttr, Weapon, ArmorPiece, FavoriteEntry } from '@/types'
import { peakSharpness, sharpnessSegments, SHARPNESS_HEX, SHARPNESS_COLOURS } from '@/utils/sharpness'
import { calcRaw, calcElement, affinityMultiplier } from '@/utils/damage'
import { effectiveHP } from '@/utils/defense'

const WEAPON_KINDS: WeaponKind[] = [
  'great-sword', 'sword-shield', 'dual-blades', 'long-sword',
  'hammer', 'hunting-horn', 'lance', 'gunlance',
  'switch-axe', 'charge-blade', 'insect-glaive',
  'light-bowgun', 'heavy-bowgun', 'bow',
]

// Phase 0.1 — component infusion slots only offer Attack (+5 raw) or Affinity (+5%)
const ARTIAN_DELTA: Record<NonNullable<ArtianAttr>, { raw?: number; affinity?: number }> = {
  Attack:   { raw: 5 },
  Affinity: { affinity: 5 },
}

const ARMOR_KINDS = ['head', 'chest', 'arms', 'waist', 'legs'] as const
type ArmorKindFilter = 'all' | typeof ARMOR_KINDS[number]

type WeaponNode = { weapon: Weapon; depth: number; children: WeaponNode[] }
type FlatNode   = WeaponNode & { rootId: number }

function buildTree(weapons: Weapon[]): WeaponNode[] {
  const roots: WeaponNode[] = []
  const nodes = new Map<number, WeaponNode>()
  for (const w of weapons) nodes.set(w.id, { weapon: w, depth: 0, children: [] })
  for (const w of weapons) {
    const node   = nodes.get(w.id)!
    const prevId = w.crafting?.previous?.id
    if (prevId && nodes.has(prevId)) {
      const parent = nodes.get(prevId)!
      node.depth   = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

function flattenTree(roots: WeaponNode[]): FlatNode[] {
  const result: FlatNode[] = []
  function walk(nodes: WeaponNode[], rootId: number) {
    for (const n of nodes) { result.push({ ...n, rootId }); walk(n.children, rootId) }
  }
  for (const root of roots) walk([root], root.weapon.id)
  return result
}

function isArtian(w: Weapon) {
  return w.name.toLowerCase().includes('artian') ||
    (w.series?.name?.toLowerCase().includes('artian') ?? false)
}

function SharpnessBar({ rarity }: { rarity: number }) {
  const segs = sharpnessSegments(rarity)
  const peak = peakSharpness(rarity)
  const label = peak.charAt(0).toUpperCase() + peak.slice(1)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <Overline>Sharpness</Overline>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--fg4)' }}>est. peak: {label}</span>
      </div>
      <div style={{ display: 'flex', height: 10, gap: 1, borderRadius: 2, overflow: 'hidden' }}>
        {segs.map((w, i) => w > 0
          ? <div key={i} style={{ width: w, background: SHARPNESS_HEX[SHARPNESS_COLOURS[i]] }} />
          : null
        )}
      </div>
    </div>
  )
}

export function EquipmentScreen() {
  const [mode,            setMode]            = useState<'weapons' | 'armor'>('weapons')
  const [weaponType,      setWeaponType]      = useState<WeaponKind>('great-sword')
  const [selectedId,      setSelectedId]      = useState<number | null>(null)
  const [artian,          setArtian]          = useState<[ArtianAttr, ArtianAttr, ArtianAttr]>([null, null, null])
  const [expandedRoots,   setExpandedRoots]   = useState<Set<number>>(new Set())
  const [weaponSearch,    setWeaponSearch]    = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [armorKind,       setArmorKind]       = useState<ArmorKindFilter>('all')
  const [armorSearch,     setArmorSearch]     = useState('')
  const [selectedArmorId, setSelectedArmorId] = useState<number | null>(null)

  const weapons  = useLiveQuery<Weapon[]>(
    () => db.weapons.where('kind').equals(weaponType).toArray(),
    [weaponType]
  )
  const allArmor = useLiveQuery<ArmorPiece[]>(() => db.armor.toArray(), [])

  const tree = useMemo(() => buildTree(weapons ?? []), [weapons])
  const flat = useMemo(() => flattenTree(tree), [tree])
  const selected = flat.find(n => n.weapon.id === selectedId)?.weapon ?? null

  useEffect(() => {
    setWeaponSearch('')
    if (mode === 'weapons') searchRef.current?.focus()
  }, [weaponType])

  useEffect(() => {
    if (mode === 'weapons') searchRef.current?.focus()
  }, [mode])

  const filteredFlat = useMemo(() => {
    const q = weaponSearch.trim().toLowerCase()
    if (!q) return flat
    return flat.filter(n => n.weapon.name.toLowerCase().includes(q))
  }, [flat, weaponSearch])

  const selectedArmor = useLiveQuery<ArmorPiece | undefined>(
    () => selectedArmorId ? db.armor.get(selectedArmorId) : Promise.resolve(undefined),
    [selectedArmorId]
  )

  const favWeaponEntry = useLiveQuery<FavoriteEntry | undefined>(
    () => selected
      ? db.favorites.where('entityId').equals(selected.id).filter(f => f.kind === 'weapon').first()
      : Promise.resolve(undefined),
    [selected?.id]
  )
  const favArmorEntry = useLiveQuery<FavoriteEntry | undefined>(
    () => selectedArmorId
      ? db.favorites.where('entityId').equals(selectedArmorId).filter(f => f.kind === 'armor').first()
      : Promise.resolve(undefined),
    [selectedArmorId]
  )

  function toggleRoot(id: number) {
    setExpandedRoots(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  // Phase 0.2 — elementDisplay = API value (shown in UI); elementTrue = display/10 (for damage math)
  function calcStats(w: Weapon) {
    const elementDisplay = w.specials?.[0]?.damage?.display ?? 0
    return artian.reduce((acc, a) => {
      if (!a) return acc
      const d = ARTIAN_DELTA[a]
      return {
        raw:            acc.raw      + (d.raw      ?? 0),
        affinity:       acc.affinity + (d.affinity ?? 0),
        elementDisplay: acc.elementDisplay,
        elementTrue:    acc.elementTrue,
        defenseBonus:   acc.defenseBonus,
      }
    }, {
      raw:            w.damage?.raw  ?? 0,
      affinity:       w.affinity     ?? 0,
      elementDisplay,
      elementTrue:    elementDisplay / 10,
      defenseBonus:   w.defenseBonus ?? 0,
    })
  }

  async function toggleWeaponFav() {
    if (!selected) return
    favWeaponEntry
      ? await db.favorites.delete(favWeaponEntry.id!)
      : await db.favorites.add({ kind: 'weapon', entityId: selected.id, name: selected.name, addedAt: Date.now() })
  }

  async function toggleArmorFav() {
    if (!selectedArmor) return
    favArmorEntry
      ? await db.favorites.delete(favArmorEntry.id!)
      : await db.favorites.add({ kind: 'armor', entityId: selectedArmor.id, name: selectedArmor.name, addedAt: Date.now() })
  }

  const filteredArmor = (allArmor ?? []).filter(a =>
    (armorKind === 'all' || a.kind === armorKind) &&
    a.name.toLowerCase().includes(armorSearch.toLowerCase())
  )

  const stats = selected ? calcStats(selected) : null

  // ── Weapon detail ────────────────────────────────────────────
  if (mode === 'weapons' && selected && stats) {
    const peak    = peakSharpness(selected.rarity ?? 1)
    const peakLbl = peak.charAt(0).toUpperCase() + peak.slice(1)
    const rawHit  = calcRaw(stats.raw, peak)
    const elemHit = stats.elementDisplay > 0 ? calcElement(stats.elementDisplay, peak) : 0
    const effRaw  = stats.affinity !== 0
      ? Math.round(stats.raw * affinityMultiplier(stats.affinity))
      : null

    return (
      <div className="page">
        <div className="screen-head">
          <button
            onClick={() => { setSelectedId(null); setArtian([null, null, null]) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg2)', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px 4px 0', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}
          >
            <Icon name="arrow-left" size={13} />Back
          </button>
          <div style={{ flex: 1 }}>
            <Overline>{weaponType.replace(/-/g, ' ')}</Overline>
            <div className="h2" style={{ marginTop: 4 }}>{selected.name}</div>
          </div>
          <EquipIcon weaponKind={weaponType} rarity={selected.rarity ?? 1} size={36} />
          <button
            onClick={toggleWeaponFav}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: favWeaponEntry ? 'var(--accent)' : 'var(--fg4)' }}
          >
            <Icon name="star" size={14} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <Panel title="Base Statistics" icon="activity">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <StatTile label="Raw Damage"    value={stats.raw}            accent />
              <StatTile label="Affinity"      value={`${stats.affinity}%`} />
              {stats.elementDisplay > 0 && <StatTile label={selected.specials?.[0]?.element ?? 'Element'} value={stats.elementDisplay} />}
              {stats.defenseBonus   > 0 && <StatTile label="Defense Bonus" value={stats.defenseBonus} />}
            </div>
            {selected.slots && selected.slots.filter(s => s > 0).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Overline style={{ marginBottom: 4 }}>Decoration Slots</Overline>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--fg2)' }}>
                  {selected.slots.filter(s => s > 0).map(s => `[${s}]`).join(' ')}
                </span>
              </div>
            )}
            <SharpnessBar rarity={selected.rarity ?? 1} />
          </Panel>

          {/* Phase 2.1 — Damage preview using verified formulas */}
          <Panel title="Damage Preview" icon="zap">
            <div style={{ marginBottom: 10, fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg4)' }}>
              Est. peak sharpness: <span style={{ color: SHARPNESS_HEX[peak] }}>{peakLbl}</span>
              {' · '}MV 100 · HZ 100 (neutral assumptions)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <StatTile label="Raw Hit" value={rawHit} accent />
              {elemHit > 0 && (
                <StatTile label={`${selected.specials?.[0]?.element ?? 'Elem'} Hit`} value={elemHit} />
              )}
              {effRaw !== null && (
                <StatTile
                  label={`Eff. Raw (${stats.affinity > 0 ? '+' : ''}${stats.affinity}% aff)`}
                  value={Math.round(effRaw)}
                />
              )}
              {elemHit > 0 && (
                <StatTile label="Total Hit" value={rawHit + elemHit} accent />
              )}
            </div>
          </Panel>

          {isArtian(selected) && (
            <Panel title="Artian Reinforcement" icon="flask-conical">
              <Overline style={{ marginBottom: 10 }}>Component Infusion Slots</Overline>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {([0, 1, 2] as const).map(i => (
                  <select
                    key={i}
                    value={artian[i] ?? ''}
                    onChange={e => {
                      const val = (e.target.value || null) as ArtianAttr
                      setArtian(prev => { const a = [...prev] as typeof artian; a[i] = val; return a })
                    }}
                    style={{ flex: 1, padding: '8px 6px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--fg1)', fontFamily: 'var(--font-ui)', fontSize: 12 }}
                  >
                    <option value="">— None —</option>
                    <option>Attack</option>
                    <option>Affinity</option>
                  </select>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <StatTile label="Final Raw" value={stats.raw}            accent />
                <StatTile label="Final Aff" value={`${stats.affinity}%`} />
              </div>
            </Panel>
          )}

          {selected.skills && selected.skills.length > 0 && (
            <Panel title="Innate Skills" icon="sparkles">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selected.skills.map((sl, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg2)', flex: 1 }}>{sl.skill.name}</span>
                    <Pill kind="neutral">Lv {sl.level}</Pill>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    )
  }

  // ── Armor detail ─────────────────────────────────────────────
  if (mode === 'armor' && selectedArmorId && selectedArmor) {
    const a   = selectedArmor
    const ehp = effectiveHP(a.defense.max)
    return (
      <div className="page">
        <div className="screen-head">
          <button
            onClick={() => setSelectedArmorId(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg2)', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px 4px 0', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}
          >
            <Icon name="arrow-left" size={13} />Back
          </button>
          <div style={{ flex: 1 }}>
            <Overline>Armor · {a.kind}</Overline>
            <div className="h2" style={{ marginTop: 4 }}>{a.name}</div>
          </div>
          <EquipIcon armorKind={a.kind} rarity={a.rarity} size={36} />
          <button
            onClick={toggleArmorFav}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: favArmorEntry ? 'var(--accent)' : 'var(--fg4)' }}
          >
            <Icon name="star" size={14} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {/* Phase 2.2 — Effective HP + resistance % */}
          <Panel title="Defense & Resistance" icon="shield">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <StatTile label="Base Def" value={a.defense.base} />
              <StatTile label="Max Def"  value={a.defense.max}  accent />
              <StatTile label="Eff. HP"  value={ehp} />
            </div>
            <Overline style={{ marginBottom: 8 }}>Elemental Resistance</Overline>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(Object.entries(a.resistances) as [string, number][]).map(([el, v]) => (
                <div key={el} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg2)', textTransform: 'capitalize' }}>{el}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: v > 0 ? 'var(--success)' : v < 0 ? '#fca5a5' : 'var(--fg4)' }}>
                    {v > 0 ? `+${v}` : v}
                  </span>
                  {v !== 0 && (
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--fg4)', width: 60 }}>
                      {Math.abs(v)}% {v > 0 ? 'less' : 'more'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Panel>

          {a.skills.length > 0 && (
            <Panel title="Armor Skills" icon="sparkles">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {a.skills.map((sl, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg2)', flex: 1 }}>{sl.skill.name}</span>
                    <Pill kind="neutral">Lv {sl.level}</Pill>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {a.slots.filter(s => s > 0).length > 0 && (
            <Panel title="Decoration Slots" icon="gem">
              <div style={{ display: 'flex', gap: 8 }}>
                {a.slots.filter(s => s > 0).map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--r-sm)', border: '1px solid var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)' }}>
                    {s}
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    )
  }

  // ── Main layout ──────────────────────────────────────────────
  return (
    <div className="page">
      <div className="screen-head">
        <div>
          <Overline>Equipment</Overline>
          <div className="h2" style={{ marginTop: 4 }}>Armory</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Segmented<'weapons' | 'armor'>
          options={['weapons', 'armor']}
          value={mode}
          onChange={v => { setMode(v); setSelectedId(null); setSelectedArmorId(null) }}
        />
      </div>

      {/* ── WEAPONS ───────────────────────────────────────────── */}
      {mode === 'weapons' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <Overline style={{ marginBottom: 8 }}>Weapon Type</Overline>
            <select
              value={weaponType}
              onChange={e => { setWeaponType(e.target.value as WeaponKind); setSelectedId(null); setExpandedRoots(new Set()) }}
              style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--fg1)', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}
            >
              {WEAPON_KINDS.map(k => <option key={k} value={k}>{k.replace(/-/g, ' ')}</option>)}
            </select>
          </div>

          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Icon name="search" size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg4)', pointerEvents: 'none' }} />
            <input
              ref={searchRef}
              value={weaponSearch}
              onChange={e => setWeaponSearch(e.target.value)}
              placeholder={`Search ${weaponType.replace(/-/g, ' ')}…`}
              style={{ width: '100%', padding: '7px 10px 7px 30px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--fg1)', fontFamily: 'var(--font-ui)', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>

          <Panel title="Upgrade Tree" icon="git-branch">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredFlat.map(({ weapon: w, depth, children, rootId }) => {
                const isRoot      = depth === 0
                const isSearching = weaponSearch.trim() !== ''
                if (!isSearching && !isRoot && !expandedRoots.has(rootId)) return null
                const isExpanded  = expandedRoots.has(w.id)
                return (
                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', marginLeft: depth * 16 }}>
                    <button
                      onClick={() => setSelectedId(w.id)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'transparent', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: '2px solid transparent', borderRadius: 'var(--r-sm)', cursor: 'pointer', textAlign: 'left' }}
                    >
                      {depth > 0 && <span style={{ color: 'var(--border-strong)', fontSize: 10 }}>└</span>}
                      <EquipIcon weaponKind={weaponType} rarity={w.rarity ?? 1} size={22} />
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg2)', flex: 1 }}>{w.name}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg3)' }}>{w.damage?.raw}</span>
                    </button>
                    {isRoot && children.length > 0 && !isSearching && (
                      <button
                        onClick={() => toggleRoot(w.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: isExpanded ? 'var(--accent)' : 'var(--fg4)', flexShrink: 0 }}
                      >
                        <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={13} />
                      </button>
                    )}
                  </div>
                )
              })}
              {filteredFlat.length === 0 && (
                <div className="overline" style={{ textAlign: 'center', padding: '16px 0' }}>
                  {weaponSearch.trim() ? 'No matches' : 'No weapons found'}
                </div>
              )}
            </div>
          </Panel>
        </>
      )}

      {/* ── ARMOR ─────────────────────────────────────────────── */}
      {mode === 'armor' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Icon name="search" size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg4)', pointerEvents: 'none' }} />
              <input
                value={armorSearch}
                onChange={e => setArmorSearch(e.target.value)}
                placeholder="Search armor…"
                style={{ width: '100%', padding: '7px 10px 7px 30px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--fg1)', fontFamily: 'var(--font-ui)', fontSize: 13 }}
              />
            </div>
            <select
              value={armorKind}
              onChange={e => setArmorKind(e.target.value as ArmorKindFilter)}
              style={{ padding: '7px 10px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--fg2)', fontFamily: 'var(--font-ui)', fontSize: 12 }}
            >
              <option value="all">All Slots</option>
              {ARMOR_KINDS.map(k => <option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
            </select>
          </div>

          <Panel>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Name</th><th>Slot</th><th>Def</th><th style={{ textAlign: 'left' }}>Skills</th></tr>
                </thead>
                <tbody>
                  {filteredArmor.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--fg4)', padding: '20px' }}>
                      {allArmor == null ? 'Loading…' : 'No armor found'}
                    </td></tr>
                  ) : filteredArmor.map(a => (
                    <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedArmorId(a.id)}>
                      <td style={{ color: 'var(--fg1)', fontFamily: 'var(--font-display)', letterSpacing: '.04em', textTransform: 'uppercase', fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <EquipIcon armorKind={a.kind} rarity={a.rarity} size={22} />
                          {a.name}
                        </div>
                      </td>
                      <td><Pill kind="neutral">{a.kind}</Pill></td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg2)' }}>{a.defense.base}</td>
                      <td style={{ textAlign: 'left', color: 'var(--fg3)', fontSize: 12 }}>
                        {a.skills.slice(0, 2).map(sl => `${sl.skill.name} ${sl.level}`).join(' · ')}
                        {a.skills.length > 2 && ' …'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
