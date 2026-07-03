import { useState, useEffect, useRef, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { Overline, Panel, Button, Icon, EquipIcon } from '@/components/ui'
import type { Skill, BuildResult, Weapon, WeaponKind, Decoration, UserTalisman, TalismanSlot } from '@/types'

interface SkillTarget { skillId: number; name: string; targetLevel: number }

const SLOT_LABEL: Record<string, string> = {
  head: 'HEAD', chest: 'CHEST', arms: 'ARMS', waist: 'WAIST', legs: 'LEGS',
}
const RES_KEYS = ['fire', 'water', 'thunder', 'ice', 'dragon'] as const

const WEAPON_KINDS: WeaponKind[] = [
  'great-sword', 'sword-shield', 'dual-blades', 'long-sword',
  'hammer', 'hunting-horn', 'lance', 'gunlance',
  'switch-axe', 'charge-blade', 'insect-glaive',
  'light-bowgun', 'heavy-bowgun', 'bow',
]

// Gogmazios end-game weapons (searchable via "gogma" / "gogmazios")
const GOGMAZIOS_WEAPONS = new Set([
  'Ostrak Oblivion', "Headsman's Hamus", 'Kyrie Verd', 'Eternal Cusp',
  'Bound Admonition', 'Onyx Chorus', 'Onyx Choros', 'Aether Pike', 'Aether Pyke',
  'Auguring Omen', 'Wicked Regnum', 'Promised Abyss', 'Limbo Llor',
  'Bethorned Agony', 'Trembling Hels', 'Calamitous Angel',
])

// Artian max-tier weapons (final upgrade form, searchable via "artian")
const ARTIAN_MAX_WEAPONS = new Set([
  'Varianza', 'Verdoloto', 'Tiltkreise', 'Dimensius', 'Moteurvankel',
  'Omiltika', 'Skyscraper', 'Argenesis', 'Mundus Altus', 'Chrono Gear',
  'Diprielcha', 'Animilater', 'Greifen', 'Angelbein',
])

// Default slot layout per rarity (resets when rarity changes in editor)
function defaultTalismanSlots(rarity: 5 | 6 | 7 | 8): TalismanSlot[] {
  if (rarity === 8) return [
    { type: 'weapon', size: 1 },  // W1 always present on R8 (datamine confirmed)
    { type: 'armor',  size: 0 },  // set to 1 if talisman has A slots
    { type: 'armor',  size: 0 },
  ]
  // R5/R6/R7 all max 2 armor slots (datamine: [A1], [A1,A1], [A2], [A2,A1], [A3])
  return [{ type: 'armor', size: 0 }, { type: 'armor', size: 0 }]
}

// Max armor slot size per rarity (datamine: ni-null/MHWilds-Charm-Odds-Calculator Rarity.json)
function maxSlotSize(rarity: 5 | 6 | 7 | 8, slotType: 'weapon' | 'armor'): number {
  if (slotType === 'weapon') return 1  // W slots are always W1
  if (rarity === 8)          return 1  // R8 armor slots max A1
  if (rarity === 7)          return 2  // R7 armor slots max A2
  if (rarity === 6)          return 2  // R6 armor slots max A2
  return 3                             // R5 armor slots max A3
}

// ── Decoration planner ────────────────────────────────────────────────────────
// Returns per-piece/weapon/talisman slot assignments.
// Map key: 'weapon' | `armor-${piece.id}` | `talisman-${t.id}`
// Map value: array of (Decoration+purpose | null) per slot index
type SlotFill = { deco: Decoration; purpose: string } | null

function planDecos(
  buildSkills:  BuildResult['skills'],
  weapon:       { slots: number[] } | null,
  pieces:       { id: number; slots: number[] }[],
  talismans:    UserTalisman[],
  targets:      SkillTarget[],
  decorations:  Decoration[],
): Map<string, SlotFill[]> {
  const haveMap = new Map(buildSkills.map(s => [s.skillId, s.level]))
  const gaps = targets
    .map(t => ({ ...t, need: t.targetLevel - (haveMap.get(t.skillId) ?? 0) }))
    .filter(g => g.need > 0)

  interface AvailSlot {
    pieceKey: string
    slotIdx:  number
    slotSize: number
    slotKind: 'weapon' | 'armor'
    used:     boolean
    fill:     SlotFill
  }

  const pool: AvailSlot[] = []

  if (weapon) {
    weapon.slots.forEach((sz, i) => {
      if (sz > 0) pool.push({ pieceKey: 'weapon', slotIdx: i, slotSize: sz, slotKind: 'weapon', used: false, fill: null })
    })
  }
  for (const p of pieces) {
    p.slots.forEach((sz, i) => {
      if (sz > 0) pool.push({ pieceKey: `armor-${p.id}`, slotIdx: i, slotSize: sz, slotKind: 'armor', used: false, fill: null })
    })
  }
  // ponytail: all registered talismans contribute slot pool; single-equip rule not enforced here
  for (const t of talismans) {
    t.slots.forEach((slot, i) => {
      if (slot.size > 0) pool.push({ pieceKey: `talisman-${t.id}`, slotIdx: i, slotSize: slot.size, slotKind: slot.type, used: false, fill: null })
    })
  }

  pool.sort((a, b) => a.slotSize - b.slotSize)  // smallest-first for greedy

  for (const gap of gaps) {
    let remaining = gap.need
    while (remaining > 0) {
      const candidates = decorations
        .filter(d => d.skills.some(sl => sl.skill.id === gap.skillId))
        .sort((a, b) => {
          const ca = a.skills.find(sl => sl.skill.id === gap.skillId)?.level ?? 0
          const cb = b.skills.find(sl => sl.skill.id === gap.skillId)?.level ?? 0
          return cb !== ca ? cb - ca : a.slot - b.slot
        })

      let placed = false
      for (const deco of candidates) {
        // Slot must match deco kind (weapon deco → weapon slot, armor deco → armor slot)
        const entry = pool.find(s => !s.used && s.slotSize >= deco.slot && s.slotKind === deco.kind)
        if (!entry) continue
        const contrib = deco.skills.find(sl => sl.skill.id === gap.skillId)?.level ?? 0
        entry.used  = true
        entry.fill  = { deco, purpose: gap.name }
        remaining  -= contrib
        placed      = true
        break
      }
      if (!placed) break
    }
  }

  const result = new Map<string, SlotFill[]>()
  if (weapon) result.set('weapon', weapon.slots.map(() => null))
  for (const p of pieces)  result.set(`armor-${p.id}`,    p.slots.map(() => null))
  for (const t of talismans) result.set(`talisman-${t.id}`, t.slots.map(() => null))
  for (const entry of pool) {
    if (entry.fill) result.get(entry.pieceKey)![entry.slotIdx] = entry.fill
  }
  return result
}

// ── Talisman row editor ───────────────────────────────────────────────────────
function TalismanRow({
  t, allSkills, decorations,
}: {
  t:            UserTalisman
  allSkills:    Skill[]
  decorations:  Decoration[]
}) {
  const [open, setOpen] = useState(false)
  const [s0q,  setS0q]  = useState('')
  const [s1q,  setS1q]  = useState('')

  const sk0 = allSkills.find(s => s.id === t.skills[0]?.skillId)
  const sk1 = allSkills.find(s => s.id === t.skills[1]?.skillId)

  // Only skills that have a matching decoration jewel in DB
  const decoEligible = allSkills.filter(s =>
    decorations.some(d => d.skills.some(sl => sl.skill.id === s.id))
  )

  // Max native talisman level = 4 − (smallest deco slot size for this skill)
  function lmax(skillId: number): number {
    const sz = decorations
      .filter(d => d.skills.some(sl => sl.skill.id === skillId))
      .reduce((min, d) => Math.min(min, d.slot), 99)
    return Math.max(1, 4 - (sz === 99 ? 1 : sz))
  }

  function pickSkill(slot: 0 | 1, skill: Skill) {
    const newSkills = [...t.skills]
    newSkills[slot] = { skillId: skill.id, level: lmax(skill.id) }
    db.userTalismans.update(t.id!, { skills: newSkills.slice(0, 2) })
    if (slot === 0) setS0q(''); else setS1q('')
  }

  function clearSkill(slot: 0 | 1) {
    const newSkills = t.skills.filter((_, i) => i !== slot)
    db.userTalismans.update(t.id!, { skills: newSkills })
  }

  function setLevel(slot: 0 | 1, level: number) {
    const newSkills = [...t.skills]
    if (!newSkills[slot]) return
    newSkills[slot] = { ...newSkills[slot], level }
    db.userTalismans.update(t.id!, { skills: newSkills })
  }

  function setRarity(rarity: 5 | 6 | 7 | 8) {
    db.userTalismans.update(t.id!, { rarity, slots: defaultTalismanSlots(rarity) })
  }

  function setSlotSize(idx: number, size: number) {
    const newSlots = t.slots.map((sl, i) => i === idx ? { ...sl, size } : sl)
    db.userTalismans.update(t.id!, { slots: newSlots as TalismanSlot[] })
  }

  const s0opts = decoEligible.filter(s =>
    s.name.toLowerCase().includes(s0q.toLowerCase()) &&
    s.id !== t.skills[1]?.skillId
  ).slice(0, 6)

  const s1opts = decoEligible.filter(s =>
    s.name.toLowerCase().includes(s1q.toLowerCase()) &&
    s.id !== t.skills[0]?.skillId
  ).slice(0, 6)

  const slotsDisplay = t.slots
    .filter(s => s.type === 'weapon' || s.size > 0)
    .map(s => s.type === 'weapon' ? '[W1]' : `[${s.size}]`)
    .join('')

  const inputStyle = {
    width: '100%', padding: '5px 8px',
    background: 'var(--bg-inset)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)', color: 'var(--fg1)',
    fontFamily: 'var(--font-ui)', fontSize: 12,
  } as const

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'visible' }}>
      {/* Summary header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', background: open ? 'var(--bg-inset)' : 'transparent', borderRadius: open ? '0' : 'var(--r-sm)' }}
      >
        <Icon name="gem" size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg1)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t.note || 'Talisman'}
        </span>
        {(sk0 || sk1) && (
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--fg3)', flexShrink: 0 }}>
            {[sk0, sk1].filter(Boolean).map((s, i) => `${i > 0 ? '· ' : ''}${s!.name} ${t.skills[i]?.level ?? ''}`).join(' ')}
          </span>
        )}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)', flexShrink: 0 }}>R{t.rarity}</span>
        {slotsDisplay && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', flexShrink: 0 }}>{slotsDisplay}</span>}
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} style={{ color: 'var(--fg4)', flexShrink: 0 }} />
        <button
          onClick={e => { e.stopPropagation(); db.userTalismans.delete(t.id!) }}
          style={{ background: 'none', border: 'none', color: 'var(--fg4)', cursor: 'pointer', padding: 2, flexShrink: 0 }}
        >
          <Icon name="trash-2" size={12} />
        </button>
      </div>

      {/* Expanded editor */}
      {open && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Note */}
          <input
            value={t.note ?? ''}
            onChange={e => db.userTalismans.update(t.id!, { note: e.target.value })}
            placeholder="Label (e.g. Att Boost + WE)"
            style={inputStyle}
          />

          {/* Rarity */}
          <div>
            <div className="overline" style={{ marginBottom: 4, fontSize: 9 }}>Rarity</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {([5, 6, 7, 8] as const).map(r => (
                <button key={r} onClick={() => setRarity(r)} style={{
                  padding: '3px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  background: t.rarity === r ? 'var(--accent)' : 'var(--bg-inset)',
                  color: t.rarity === r ? 'var(--bg-base)' : 'var(--fg3)',
                }}>R{r}</button>
              ))}
            </div>
          </div>

          {/* Skills */}
          <div>
            <div className="overline" style={{ marginBottom: 6, fontSize: 9 }}>Skills (up to 2)</div>
            {([0, 1] as const).map(slot => {
              const sk    = slot === 0 ? sk0 : sk1
              const entry = t.skills[slot]
              const q     = slot === 0 ? s0q : s1q
              const setQ  = slot === 0 ? setS0q : setS1q
              const opts  = slot === 0 ? s0opts : s1opts
              const max   = sk ? lmax(sk.id) : 3
              return (
                <div key={slot} style={{ marginBottom: 6, position: 'relative' }}>
                  {sk ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg2)', flex: 1 }}>{sk.name}</span>
                        <button onClick={() => clearSkill(slot)} style={{ background: 'none', border: 'none', color: 'var(--fg4)', cursor: 'pointer', padding: 0 }}>
                          <Icon name="x" size={11} />
                        </button>
                      </div>
                      <span className="overline" style={{ fontSize: 9, flexShrink: 0 }}>Lv.</span>
                      <input
                        type="number" min={1} max={max} value={entry.level}
                        onChange={e => setLevel(slot, Math.min(max, Math.max(1, Number(e.target.value))))}
                        style={{ width: 38, padding: '4px 4px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'center' }}
                      />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)', flexShrink: 0 }}>/{max}</span>
                    </div>
                  ) : (
                    <>
                      <input
                        value={q} onChange={e => setQ(e.target.value)}
                        placeholder={`Skill ${slot + 1}…`}
                        style={inputStyle}
                      />
                      {q && opts.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', zIndex: 20, marginTop: 2 }}>
                          {opts.map(s => (
                            <button key={s.id} onClick={() => pickSkill(slot, s)} style={{ display: 'block', width: '100%', padding: '6px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-soft)', color: 'var(--fg2)', fontFamily: 'var(--font-ui)', fontSize: 12, textAlign: 'left', cursor: 'pointer' }}>
                              {s.name}
                              <span style={{ color: 'var(--fg4)', fontSize: 10, marginLeft: 6 }}>max Lv.{lmax(s.id)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* Slots */}
          <div>
            <div className="overline" style={{ marginBottom: 6, fontSize: 9 }}>Decoration Slots</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {t.slots.map((slot, i) => {
                if (slot.type === 'weapon') {
                  // W1 is fixed on R8 — always size 1, no picker needed
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 5px', borderRadius: 3,
                        background: 'rgba(167,139,250,0.15)', color: '#a78bfa',
                        border: '1px solid rgba(167,139,250,0.3)',
                      }}>W1</span>
                    </div>
                  )
                }
                const maxSz = maxSlotSize(t.rarity, 'armor')
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 5px', borderRadius: 3, flexShrink: 0,
                      background: 'var(--bg-inset)', color: 'var(--fg4)', border: '1px solid var(--border)',
                    }}>A</span>
                    {Array.from({ length: maxSz + 1 }, (_, sz) => (
                      <button key={sz} onClick={() => setSlotSize(i, sz)} style={{
                        width: 22, height: 22, border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer',
                        fontFamily: 'var(--font-mono)', fontSize: 11,
                        background: slot.size === sz ? 'var(--accent)' : 'var(--bg-inset)',
                        color:      slot.size === sz ? 'var(--bg-base)' : 'var(--fg3)',
                      }}>{sz}</button>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Build card ────────────────────────────────────────────────────────────────
function BuildCard({
  build, targets, index, decorations, weapon, talismans,
}: {
  build:        BuildResult
  targets:      SkillTarget[]
  index:        number
  decorations:  Decoration[]
  weapon:       Weapon | null
  talismans:    UserTalisman[]
}) {
  const targetMap = new Map(targets.map(t => [t.skillId, t.targetLevel]))
  const haveMap   = new Map(build.skills.map(s => [s.skillId, s.level]))
  const allMet    = targets.every(t => (haveMap.get(t.skillId) ?? 0) >= t.targetLevel)

  const pieceDecos = allMet ? new Map<string, SlotFill[]>() : planDecos(
    build.skills,
    weapon ? { slots: weapon.slots ?? [] } : null,
    build.pieces,
    talismans,
    targets,
    decorations,
  )

  const hasAnyDeco = [...pieceDecos.values()].some(fills => fills.some(f => f != null))

  function DecoRows({ pieceKey, slots }: { pieceKey: string; slots: number[] }) {
    const fills = pieceDecos.get(pieceKey)
    if (!fills) return null
    return (
      <>
        {slots.map((sz, i) => {
          const fill = fills[i]
          if (!fill || sz === 0) return null
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0 2px 28px' }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)',
                background: 'var(--bg-inset)', padding: '1px 4px', borderRadius: 3, flexShrink: 0,
              }}>[{sz}]</span>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg2)', flex: 1 }}>
                {fill.deco.name}
              </span>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--fg4)' }}>
                {fill.purpose}
              </span>
            </div>
          )
        })}
      </>
    )
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden', marginBottom: 8 }}>
      {/* Header */}
      <div style={{ padding: '6px 12px', background: 'var(--bg-inset)', borderBottom: '1px solid var(--border)' }}>
        <Overline>Build {index + 1}</Overline>
      </div>

      {/* Weapon + armor + talisman pieces with inline deco slots */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)' }}>
        {weapon && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <EquipIcon weaponKind={weapon.kind as WeaponKind} rarity={weapon.rarity} size={20} />
              <span className="overline" style={{ width: 46, flexShrink: 0, color: 'var(--fg4)', fontSize: 9 }}>WEAPON</span>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg2)', flex: 1 }}>{weapon.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)' }}>
                {(weapon.slots ?? []).filter(s => s > 0).map(s => `[${s}]`).join('')}
              </span>
            </div>
            <DecoRows pieceKey="weapon" slots={weapon.slots ?? []} />
          </>
        )}
        {build.pieces.map(p => (
          <div key={p.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <EquipIcon armorKind={p.kind} rarity={p.rarity} size={20} />
              <span className="overline" style={{ width: 46, flexShrink: 0, color: 'var(--fg4)', fontSize: 9 }}>
                {SLOT_LABEL[p.kind]}
              </span>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg2)', flex: 1 }}>{p.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)' }}>
                {p.slots.filter(s => s > 0).map(s => `[${s}]`).join('')}
              </span>
            </div>
            <DecoRows pieceKey={`armor-${p.id}`} slots={p.slots} />
          </div>
        ))}
        {/* Talisman rows */}
        {talismans.map(t => {
          const tFills  = pieceDecos.get(`talisman-${t.id}`)
          const hasSlot = t.slots.some(s => s.size > 0)
          if (!hasSlot) return null
          return (
            <div key={t.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                <Icon name="gem" size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span className="overline" style={{ width: 46, flexShrink: 0, color: 'var(--fg4)', fontSize: 9 }}>CHARM</span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg2)', flex: 1 }}>
                  {t.note || 'Talisman'}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)' }}>
                  R{t.rarity}{' '}{t.slots.filter(s => s.size > 0).map(s => s.type === 'weapon' ? '[W]' : `[${s.size}]`).join('')}
                </span>
              </div>
              {tFills && t.slots.map((slot, i) => {
                const fill = tFills[i]
                if (!fill || slot.size === 0) return null
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0 2px 28px' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10,
                      color: slot.type === 'weapon' ? '#a78bfa' : 'var(--accent)',
                      background: 'var(--bg-inset)', padding: '1px 4px', borderRadius: 3, flexShrink: 0,
                    }}>
                      {slot.type === 'weapon' ? '[W]' : `[${slot.size}]`}
                    </span>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg2)', flex: 1 }}>
                      {fill.deco.name}
                    </span>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--fg4)' }}>
                      {fill.purpose}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
        {!allMet && !hasAnyDeco && (
          <div style={{ paddingTop: 4, fontSize: 11, color: '#fca5a5' }}>
            ⚠ No slots available to reach all targets
          </div>
        )}
      </div>

      {/* Skills */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)' }}>
        <Overline style={{ marginBottom: 8 }}>Active Skills</Overline>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...build.skills]
            .sort((a, b) => {
              const at = targetMap.has(a.skillId) ? 1 : 0
              const bt = targetMap.has(b.skillId) ? 1 : 0
              return bt - at || b.level - a.level
            })
            .map(s => {
              const target  = targetMap.get(s.skillId)
              const met     = target == null || s.level >= target
              const fillPct = Math.min(s.level / Math.max(s.cap, 1), 1) * 100
              return (
                <div key={s.skillId}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: met ? 'var(--fg2)' : 'var(--fg4)' }}>
                      {s.name}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11,
                      color: s.overcapped ? 'var(--warning)' : (met && target != null ? 'var(--accent)' : 'var(--fg3)'),
                    }}>
                      Lv.{s.level}
                      {target != null && !met && `/${target}`}
                      {s.overcapped && `/${s.cap}`}
                    </span>
                  </div>
                  <div style={{ height: 3, background: 'var(--bg-inset)', borderRadius: 2 }}>
                    <div style={{
                      height: '100%', borderRadius: 2, width: `${fillPct}%`,
                      background: s.overcapped ? 'var(--warning)' : (met && target != null ? 'var(--accent)' : 'var(--fg4)'),
                    }} />
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* Set bonuses */}
      {build.setBonuses.length > 0 && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)' }}>
          <Overline style={{ marginBottom: 8 }}>Set Bonuses</Overline>
          {build.setBonuses.map(sb => (
            <div key={sb.setId} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg2)' }}>{sb.setName}</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)',
                  background: 'var(--bg-inset)', padding: '1px 5px', borderRadius: 4,
                }}>×{sb.pieceCount}</span>
              </div>
              {sb.skills.length === 0 ? (
                <span style={{ fontSize: 11, color: 'var(--fg4)', paddingLeft: 12 }}>No active bonus skills detected</span>
              ) : sb.skills.map(s => (
                <div key={s.skillId} style={{ display: 'flex', gap: 6, paddingLeft: 12, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, color: 'var(--accent)' }}>✓</span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg3)' }}>
                    {s.name} Lv.{s.level}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Defense + resistances */}
      <div style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg2)' }}>
          DEF{' '}
          <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg1)' }}>{build.totalDefense}</strong>
        </span>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg2)' }}>
          Eff. HP{' '}
          <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{build.effectiveHP}</strong>
        </span>
        <span style={{ color: 'var(--border)', fontSize: 14 }}>|</span>
        {RES_KEYS.map(el => {
          const v = build.resistances[el]
          return (
            <span key={el} style={{
              fontFamily: 'var(--font-ui)', fontSize: 11,
              color: v > 0 ? 'var(--success)' : v < 0 ? '#fca5a5' : 'var(--fg4)',
            }}>
              {el.charAt(0).toUpperCase()}: {v > 0 ? `+${v}` : v}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────
export function SetBuilderScreen() {
  const [targets,        setTargets]        = useState<SkillTarget[]>([])
  const [skillSearch,    setSkillSearch]    = useState('')
  const [weaponKind,     setWeaponKind]     = useState<WeaponKind>('great-sword')
  const [weaponSearch,   setWeaponSearch]   = useState('')
  const [selectedWeapon, setSelectedWeapon] = useState<Weapon | null>(null)
  const [gogmaSkills,    setGogmaSkills]    = useState<[Skill | null, Skill | null]>([null, null])
  const [gogmaSearch,    setGogmaSearch]    = useState<[string, string]>(['', ''])
  const [searching,      setSearching]      = useState(false)
  const [results,        setResults]        = useState<BuildResult[]>([])
  const [searchMs,       setSearchMs]       = useState<number | null>(null)
  const workerRef = useRef<Worker | null>(null)

  const skills      = useLiveQuery(() => db.skills.toArray(),                                   [])
  const talismans   = useLiveQuery(() => db.userTalismans.toArray(),                            [])
  const armorData   = useLiveQuery(() => db.armor.toArray(),                                    [])
  const weaponsData = useLiveQuery(() => db.weapons.where('kind').equals(weaponKind).toArray(), [weaponKind])
  const decorations = useLiveQuery(() => db.decorations.toArray(),                              [])

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/mss.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current.onmessage = (e: MessageEvent) => {
      setResults(e.data.builds ?? [])
      setSearchMs(e.data.durationMs ?? null)
      setSearching(false)
    }
    return () => workerRef.current?.terminate()
  }, [])

  const isGogmaWeapon = selectedWeapon != null && GOGMAZIOS_WEAPONS.has(selectedWeapon.name)

  const filteredSkills = (skills ?? []).filter(s =>
    s.name.toLowerCase().includes(skillSearch.toLowerCase()) &&
    !targets.some(t => t.skillId === s.id)
  ).slice(0, 8)

  function gogmaFiltered(slot: 0 | 1) {
    const q     = gogmaSearch[slot].toLowerCase()
    const other = gogmaSkills[slot === 0 ? 1 : 0]
    return (skills ?? [])
      .filter(s =>
        s.ranks.some(r => r.setPiecesRequired != null) &&  // set bonus skills only
        s.name.toLowerCase().includes(q) &&
        s.id !== other?.id
      )
      .slice(0, 6)
  }

  function selectGogmaSkill(slot: 0 | 1, skill: Skill) {
    setGogmaSkills(prev => { const n = [...prev] as [Skill|null,Skill|null]; n[slot] = skill; return n })
    setGogmaSearch(prev => { const n = [...prev] as [string,string]; n[slot] = ''; return n })
  }

  function clearGogmaSkill(slot: 0 | 1) {
    setGogmaSkills(prev => { const n = [...prev] as [Skill|null,Skill|null]; n[slot] = null; return n })
  }

  // Virtual category search: "gogma"/"gogmazios" → Gogmazios weapons, "artian" → Artian line
  const filteredWeapons = (weaponsData ?? [])
    .filter(w => {
      const q = weaponSearch.toLowerCase()
      if (!q) return true
      if (w.name.toLowerCase().includes(q)) return true
      const isGogma  = GOGMAZIOS_WEAPONS.has(w.name)
      const isArtian = ARTIAN_MAX_WEAPONS.has(w.name) || /^artian /i.test(w.name)
      if (isGogma  && 'gogmazios'.includes(q)) return true
      if (isArtian && 'artian'.includes(q))    return true
      return false
    })
    .sort((a, b) => {
      // Priority: Gogmazios > Artian max > Artian base > rest; then rarity desc
      const pri = (w: Weapon) =>
        GOGMAZIOS_WEAPONS.has(w.name) ? 3 :
        ARTIAN_MAX_WEAPONS.has(w.name) ? 2 :
        /^artian /i.test(w.name) ? 1 : 0
      return pri(b) - pri(a) || b.rarity - a.rarity
    })

  // Skills suggested from selected weapon (innate + gogma picks) and configured talismans
  // Only shows skills not already in targets
  const suggestedSkills = useMemo(() => {
    const already = new Set(targets.map(t => t.skillId))
    const seen    = new Set<number>()
    const result: Skill[] = []
    const tryAdd = (skillId: number) => {
      if (already.has(skillId) || seen.has(skillId)) return
      const sk = (skills ?? []).find(s => s.id === skillId)
      if (sk) { seen.add(skillId); result.push(sk) }
    }
    if (selectedWeapon) {
      for (const sl of selectedWeapon.skills ?? []) tryAdd(sl.skill.id)
      if (isGogmaWeapon) {
        for (const gs of gogmaSkills) if (gs) tryAdd(gs.id)
      }
    }
    for (const t of (talismans ?? [])) {
      for (const ts of t.skills) tryAdd(ts.skillId)
    }
    return result
  }, [selectedWeapon, gogmaSkills, isGogmaWeapon, talismans, targets, skills])

  function addTarget(skill: Skill) {
    setTargets(prev => [...prev, { skillId: skill.id, name: skill.name, targetLevel: skill.maxLevel }])
    setSkillSearch('')
  }

  function removeTarget(skillId: number) {
    setTargets(prev => prev.filter(t => t.skillId !== skillId))
  }

  function updateTarget(skillId: number, level: number) {
    setTargets(prev => prev.map(t => t.skillId === skillId ? { ...t, targetLevel: level } : t))
  }

  function runSearch() {
    if (targets.length === 0 || !workerRef.current) return
    setSearching(true)
    workerRef.current.postMessage({
      type:      'SEARCH',
      targets,
      armor:     armorData  ?? [],
      skills:    skills     ?? [],
      talismans: talismans  ?? [],
      weapon:    selectedWeapon ? {
        slots:  selectedWeapon.slots ?? [],
        skills: [
          ...(selectedWeapon.skills ?? []),
          ...(isGogmaWeapon && gogmaSkills[0] ? [{ skill: { id: gogmaSkills[0].id, name: gogmaSkills[0].name }, level: 1 }] : []),
          ...(isGogmaWeapon && gogmaSkills[1] ? [{ skill: { id: gogmaSkills[1].id, name: gogmaSkills[1].name }, level: 1 }] : []),
        ],
      } : null,
    })
  }

  async function addTalisman() {
    await db.userTalismans.add({
      rarity: 8,
      skills: [],
      slots:  defaultTalismanSlots(8),
      note:   '',
    })
  }

  return (
    <div className="page">
      <div className="screen-head">
        <div>
          <Overline>Mixed Set Searcher</Overline>
          <div className="h2" style={{ marginTop: 4 }}>Set Builder</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {/* Skill selector */}
        <Panel title="Desired Skills" icon="list-checks">
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Icon name="search" size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg4)', pointerEvents: 'none' }} />
            <input
              value={skillSearch}
              onChange={e => setSkillSearch(e.target.value)}
              placeholder="Search skills…"
              style={{ width: '100%', padding: '7px 10px 7px 30px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--fg1)', fontFamily: 'var(--font-ui)', fontSize: 13 }}
            />
            {skillSearch && filteredSkills.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', zIndex: 10, marginTop: 2 }}>
                {filteredSkills.map(s => (
                  <button key={s.id} onClick={() => addTarget(s)} style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-soft)', color: 'var(--fg2)', fontFamily: 'var(--font-ui)', fontSize: 13, textAlign: 'left', cursor: 'pointer' }}>
                    {s.name} <span style={{ color: 'var(--fg4)', fontSize: 11 }}>max Lv.{s.maxLevel}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {targets.length === 0 ? (
            <div className="overline" style={{ textAlign: 'center', padding: '16px 0', color: 'var(--fg4)' }}>
              Add skills above to search
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {targets.map(t => {
                const skill = (skills ?? []).find(s => s.id === t.skillId)
                return (
                  <div key={t.skillId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg1)', flex: 1 }}>{t.name}</span>
                    <span className="overline">Lv.</span>
                    <input
                      type="number" min={1} max={skill?.maxLevel ?? 10} value={t.targetLevel}
                      onChange={e => updateTarget(t.skillId, Number(e.target.value))}
                      style={{ width: 44, padding: '4px 6px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 13, textAlign: 'center' }}
                    />
                    <button onClick={() => removeTarget(t.skillId)} style={{ background: 'none', border: 'none', color: 'var(--fg4)', cursor: 'pointer', padding: 4 }}>
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Suggestions from weapon + talisman */}
          {suggestedSkills.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-soft)' }}>
              <div className="overline" style={{ marginBottom: 6, fontSize: 9 }}>SUGGESTED FROM EQUIPMENT</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {suggestedSkills.map(s => (
                  <button
                    key={s.id}
                    onClick={() => addTarget(s)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', background: 'var(--bg-inset)',
                      border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                      color: 'var(--fg3)', fontFamily: 'var(--font-ui)', fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>+</span>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Button
              variant="pri" icon="search" onClick={runSearch}
              disabled={targets.length === 0 || searching || !selectedWeapon}
              style={{ flex: 1 }} id="mss-search-btn"
            >
              {searching ? 'SEARCHING…' : 'SEARCH BUILDS'}
            </Button>
          </div>
          {!selectedWeapon && (
            <div className="overline" style={{ marginTop: 6, textAlign: 'center', color: 'var(--fg4)' }}>
              Select a weapon below to enable search
            </div>
          )}
          {searchMs != null && (
            <div className="overline" style={{ marginTop: 8, textAlign: 'right' }}>Query: {searchMs}ms</div>
          )}
        </Panel>

        {/* Weapon picker */}
        <Panel title="Weapon" icon="sword">
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <select
              value={weaponKind}
              onChange={e => { setWeaponKind(e.target.value as WeaponKind); setSelectedWeapon(null); setGogmaSkills([null, null]); setGogmaSearch(['', '']) }}
              style={{ padding: '6px 8px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--fg2)', fontFamily: 'var(--font-ui)', fontSize: 12, flexShrink: 0 }}
            >
              {WEAPON_KINDS.map(k => (
                <option key={k} value={k}>{k.replace(/-/g, ' ')}</option>
              ))}
            </select>
            <div style={{ position: 'relative', flex: 1 }}>
              <Icon name="search" size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg4)', pointerEvents: 'none' }} />
              <input
                value={weaponSearch}
                onChange={e => setWeaponSearch(e.target.value)}
                placeholder="Filter…"
                style={{ width: '100%', padding: '6px 8px 6px 26px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--fg1)', fontFamily: 'var(--font-ui)', fontSize: 12 }}
              />
            </div>
          </div>

          {selectedWeapon && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: 'var(--bg-inset)', borderRadius: 'var(--r-sm)', border: '1px solid var(--accent)', marginBottom: 10 }}>
              <EquipIcon weaponKind={weaponKind} rarity={selectedWeapon.rarity} size={22} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg1)', marginBottom: 2 }}>{selectedWeapon.name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg3)' }}>
                  Raw {selectedWeapon.damage?.raw}
                  {selectedWeapon.affinity ? ` | ${selectedWeapon.affinity > 0 ? '+' : ''}${selectedWeapon.affinity}% Aff` : ''}
                  {(selectedWeapon.slots ?? []).filter(s => s > 0).length > 0
                    ? ` | ${selectedWeapon.slots.filter(s => s > 0).map(s => `[${s}]`).join('')}`
                    : ''}
                </div>
                {(selectedWeapon.skills ?? []).length > 0 && (
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--fg4)', marginTop: 2 }}>
                    {selectedWeapon.skills.map(sl => `${sl.skill.name} Lv.${sl.level}`).join(' · ')}
                  </div>
                )}
                {isGogmaWeapon && (
                  <div style={{ marginTop: 8, borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#a78bfa', letterSpacing: '0.05em' }}>
                      SET BONUS SKILLS — pick 2 different
                    </span>
                    {([0, 1] as const).map(slot => (
                      <div key={slot} style={{ position: 'relative', marginTop: 6 }}>
                        {gogmaSkills[slot] ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'rgba(167,139,250,0.10)', borderRadius: 'var(--r-sm)', border: '1px solid rgba(167,139,250,0.25)' }}>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: '#a78bfa', flex: 1 }}>{gogmaSkills[slot]!.name}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)' }}>Lv.1</span>
                            <button onClick={() => clearGogmaSkill(slot)} style={{ background: 'none', border: 'none', color: 'var(--fg4)', cursor: 'pointer', padding: 2 }}>
                              <Icon name="x" size={11} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <input
                              value={gogmaSearch[slot]}
                              onChange={e => setGogmaSearch(prev => { const n = [...prev] as [string,string]; n[slot] = e.target.value; return n })}
                              placeholder={`Set bonus skill ${slot + 1}…`}
                              style={{ width: '100%', padding: '5px 8px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--fg1)', fontFamily: 'var(--font-ui)', fontSize: 12 }}
                            />
                            {gogmaSearch[slot] && gogmaFiltered(slot).length > 0 && (
                              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', zIndex: 20, marginTop: 2 }}>
                                {gogmaFiltered(slot).map(s => (
                                  <button key={s.id} onClick={() => selectGogmaSkill(slot, s)} style={{ display: 'block', width: '100%', padding: '7px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-soft)', color: 'var(--fg2)', fontFamily: 'var(--font-ui)', fontSize: 12, textAlign: 'left', cursor: 'pointer' }}>
                                    {s.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setSelectedWeapon(null)} style={{ background: 'none', border: 'none', color: 'var(--fg4)', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                <Icon name="x" size={12} />
              </button>
            </div>
          )}

          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {filteredWeapons.length === 0 ? (
              <div className="overline" style={{ textAlign: 'center', padding: '14px 0', color: 'var(--fg4)' }}>
                {weaponsData == null ? 'Loading…' : 'No weapons found'}
              </div>
            ) : filteredWeapons.map(w => (
              <button
                key={w.id}
                onClick={() => { setSelectedWeapon(w); setGogmaSkills([null, null]); setGogmaSearch(['', '']) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '5px 8px', background: selectedWeapon?.id === w.id ? 'var(--bg-inset)' : 'transparent',
                  border: 'none', borderLeft: `2px solid ${selectedWeapon?.id === w.id ? 'var(--accent)' : 'transparent'}`,
                  borderRadius: 'var(--r-sm)', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <EquipIcon weaponKind={weaponKind} rarity={w.rarity} size={18} />
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg2)', flex: 1 }}>{w.name}</span>
                {GOGMAZIOS_WEAPONS.has(w.name) && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', padding: '1px 4px', borderRadius: 3, flexShrink: 0 }}>GOGMA</span>
                )}
                {ARTIAN_MAX_WEAPONS.has(w.name) && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', background: 'rgba(var(--accent-rgb,180,130,40),0.12)', padding: '1px 4px', borderRadius: 3, flexShrink: 0 }}>ARTIAN</span>
                )}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)' }}>
                  {w.damage?.raw}
                  {(w.slots ?? []).filter((s: number) => s > 0).map((s: number) => `[${s}]`).join('')}
                </span>
              </button>
            ))}
          </div>
        </Panel>

        {/* Talisman library */}
        <Panel title="Talisman Library" icon="gem" action={<Button variant="ghost" icon="plus" onClick={addTalisman}>Add</Button>}>
          {!talismans || talismans.length === 0 ? (
            <div className="overline" style={{ textAlign: 'center', padding: '16px 0', color: 'var(--fg4)' }}>
              No talismans — tap Add to register owned talismans
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {talismans.map(t => (
                <TalismanRow
                  key={t.id}
                  t={t}
                  allSkills={skills ?? []}
                  decorations={decorations ?? []}
                />
              ))}
            </div>
          )}
        </Panel>

        {/* Results */}
        {results.length > 0 && (
          <Panel title={`Results — ${results.length} builds`} icon="layers">
            {results.map((build, i) => (
              <BuildCard
                key={i}
                build={build}
                targets={targets}
                index={i}
                decorations={decorations ?? []}
                weapon={selectedWeapon}
                talismans={talismans ?? []}
              />
            ))}
          </Panel>
        )}
      </div>
    </div>
  )
}
