import { useState, useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { Overline, Icon, EquipIcon } from '@/components/ui'
import { getBuilds, getBuild, postBuild, voteBuild } from '@/api/community'
import type {
  Skill, Weapon, WeaponKind, ArmorPiece, Decoration, UserTalisman,
  SavedSet, DecoAssignment, ArtianAttr, CommunityBuild, BuildSharePayload,
} from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const ARMOR_SLOTS = ['head', 'chest', 'arms', 'waist', 'legs'] as const
type ArmorSlotKey = typeof ARMOR_SLOTS[number]

const SLOT_LABELS: Record<ArmorSlotKey, string> = {
  head: 'HEAD', chest: 'CHEST', arms: 'ARMS', waist: 'WAIST', legs: 'LEGS',
}

const WEAPON_KINDS: WeaponKind[] = [
  'great-sword', 'sword-shield', 'dual-blades', 'long-sword',
  'hammer', 'hunting-horn', 'lance', 'gunlance',
  'switch-axe', 'charge-blade', 'insect-glaive',
  'light-bowgun', 'heavy-bowgun', 'bow',
]

const GOGMAZIOS_WEAPONS = new Set([
  'Ostrak Oblivion', "Headsman's Hamus", 'Kyrie Verd', 'Eternal Cusp',
  'Bound Admonition', 'Onyx Chorus', 'Onyx Choros', 'Aether Pike', 'Aether Pyke',
  'Auguring Omen', 'Wicked Regnum', 'Promised Abyss', 'Limbo Llor',
  'Bethorned Agony', 'Trembling Hels', 'Calamitous Angel',
])

const ARTIAN_MAX_WEAPONS = new Set([
  'Varianza', 'Verdoloto', 'Tiltkreise', 'Dimensius', 'Moteurvankel',
  'Omiltika', 'Skyscraper', 'Argenesis', 'Mundus Altus', 'Chrono Gear',
  'Diprielcha', 'Animilater', 'Greifen', 'Angelbein',
])

const RES_KEYS = ['fire', 'water', 'thunder', 'ice', 'dragon'] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptySet(name: string): Omit<SavedSet, 'id'> {
  return {
    name,
    weaponId: null,
    gogmaSkillIds: [],
    artianAttr: null,
    armorIds: { head: null, chest: null, arms: null, waist: null, legs: null },
    talismanId: null,
    decoAssignments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function computeSkills(
  weapon:          Weapon | null,
  gogmaSkillIds:   number[],
  armorPieces:     (ArmorPiece | null)[],
  talisman:        UserTalisman | null,
  decoAssignments: DecoAssignment[],
  allDecos:        Decoration[],
  allSkills:       Skill[],
): { skillId: number; name: string; level: number; cap: number; overcapped: boolean }[] {
  const totals = new Map<number, number>()
  const add = (id: number, lv: number) => totals.set(id, (totals.get(id) ?? 0) + lv)

  weapon?.skills.forEach(sl => add(sl.skill.id, sl.level))
  gogmaSkillIds.forEach(id => add(id, 1))
  armorPieces.forEach(p => p?.skills.forEach(sl => add(sl.skill.id, sl.level)))
  talisman?.skills.forEach(ts => add(ts.skillId, ts.level))
  decoAssignments.forEach(da => {
    if (!da.decorationId) return
    allDecos.find(d => d.id === da.decorationId)?.skills.forEach(sl => add(sl.skill.id, sl.level))
  })

  return Array.from(totals.entries())
    .map(([skillId, level]) => {
      const skill = allSkills.find(s => s.id === skillId)
      const cap   = skill?.maxLevel ?? level
      return { skillId, name: skill?.name ?? `#${skillId}`, level, cap, overcapped: level > cap }
    })
    .filter(s => s.level > 0)
    .sort((a, b) => b.level - a.level)
}

function computeDefense(pieces: (ArmorPiece | null)[]) {
  return {
    base: pieces.reduce((s, p) => s + (p?.defense.base ?? 0), 0),
    max:  pieces.reduce((s, p) => s + (p?.defense.max  ?? 0), 0),
    res:  Object.fromEntries(RES_KEYS.map(k => [
      k, pieces.reduce((s, p) => s + ((p?.resistances as Record<string, number>)?.[k] ?? 0), 0),
    ])) as Record<typeof RES_KEYS[number], number>,
  }
}

function slotBrackets(slots: number[]): string {
  return slots.filter(s => s > 0).map(s => `[${s}]`).join('')
}

// ── Shared style tokens ───────────────────────────────────────────────────────

const inp = {
  width: '100%', padding: '5px 8px',
  background: 'var(--bg-inset)', border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)', color: 'var(--fg1)',
  fontFamily: 'var(--font-ui)', fontSize: 12,
} as const

const panelStyle = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  overflow: 'hidden',
} as const

const headerBtn = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', padding: '9px 10px',
  background: 'transparent', border: 'none',
  cursor: 'pointer', textAlign: 'left' as const,
} as const

// ── Sub-components ────────────────────────────────────────────────────────────

function DecoSlotRow({
  label, slotSize, slotKind, currentDecoId, allDecos, userDecos, assignments,
  onChange,
}: {
  label:        string
  slotSize:     number
  slotKind:     'weapon' | 'armor'
  currentDecoId: number | null
  allDecos:     Decoration[]
  userDecos:    { decorationId: number; quantity: number }[]
  assignments:  DecoAssignment[]
  onChange:     (decoId: number | null) => void
}) {
  const eligible = allDecos.filter(d => {
    if (d.kind !== slotKind || d.slot > slotSize) return false
    const owned = userDecos.find(ud => ud.decorationId === d.id)?.quantity ?? 0
    if (owned === 0) return false
    // count how many times this deco is used elsewhere
    const usedElsewhere = assignments.filter(
      da => da.decorationId === d.id && da.decorationId !== currentDecoId
    ).length + (currentDecoId === d.id ? 0 : 0)
    // simplified: just check ownership, not multi-use limit
    return owned > usedElsewhere
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, padding: '1px 5px',
        borderRadius: 3, flexShrink: 0, whiteSpace: 'nowrap',
        background: slotKind === 'weapon' ? 'rgba(167,139,250,.15)' : 'var(--bg-inset)',
        color:      slotKind === 'weapon' ? '#a78bfa' : 'var(--fg4)',
        border:     `1px solid ${slotKind === 'weapon' ? 'rgba(167,139,250,.3)' : 'var(--border)'}`,
      }}>{label}</span>
      <select
        value={currentDecoId ?? ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
        style={{ ...inp, padding: '3px 6px', fontSize: 11 }}
      >
        <option value="">— empty —</option>
        {eligible.map(d => (
          <option key={d.id} value={d.id}>
            {d.name}  (Lv.{d.slot})
          </option>
        ))}
      </select>
    </div>
  )
}

function CommunityCard({
  build, onVote, onClone,
}: {
  build:   CommunityBuild
  onVote:  (id: string) => void
  onClone: (build: CommunityBuild) => void
}) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg1)' }}>{build.title}</div>
          {build.weaponKind && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)', marginTop: 2 }}>
              {build.weaponKind.replace(/-/g, ' ').toUpperCase()}
              {build.source === 'manual' && (
                <span style={{ marginLeft: 6, padding: '1px 5px', background: 'rgba(167,139,250,.15)', color: '#a78bfa', borderRadius: 3, fontSize: 9 }}>CUSTOM</span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => onVote(build.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 11 }}
        >
          <Icon name="chevron-up" size={12} />
          {build.votes}
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {build.skills.slice(0, 5).map((s, i) => (
          <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '1px 6px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--fg3)' }}>
            {s.name} {s.level}
          </span>
        ))}
        {build.skills.length > 5 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)' }}>+{build.skills.length - 5} more</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <button
          onClick={() => onClone(build)}
          style={{ padding: '4px 10px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--bg-base)', fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700, letterSpacing: '.08em' }}
        >
          CLONE INTO MY SETS
        </button>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)', alignSelf: 'center' }}>
          {new Date(build.createdAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function CustomSetBuilderScreen() {
  const [tab,           setTab]          = useState<'my-sets' | 'community'>('my-sets')
  const [activeSetId,   setActiveSetId]  = useState<number | null>(null)
  const [weaponKind,    setWeaponKind]   = useState<WeaponKind>('great-sword')
  const [weaponFilter,  setWeaponFilter] = useState('')
  const [expandedPanel, setExpanded]     = useState<string | null>('weapon')
  const [armorFilters,  setArmorFilters] = useState<Partial<Record<ArmorSlotKey, string>>>({})
  const [gogmaQueries,  setGogmaQueries] = useState<[string, string]>(['', ''])
  const [skillQuery,    setSkillQuery]   = useState('')

  // Community state
  const [communityBuilds,  setCommunityBuilds]  = useState<CommunityBuild[]>([])
  const [communityLoading, setCommunityLoading] = useState(false)
  const [communityError,   setCommunityError]   = useState<string | null>(null)
  const [commWeaponFilter, setCommWeaponFilter] = useState('')
  const [commSkillFilter,  setCommSkillFilter]  = useState('')
  const [commSort,         setCommSort]         = useState<'votes' | 'new'>('votes')
  const [publishModal,     setPublishModal]     = useState(false)
  const [publishTitle,     setPublishTitle]     = useState('')
  const [publishState,     setPublishState]     = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [publishUrl,       setPublishUrl]       = useState('')

  // ── Dexie live queries ──────────────────────────────────────────────────────

  const savedSets    = useLiveQuery(() => db.savedSets.orderBy('updatedAt').reverse().toArray(), [])
  const activeSet    = useLiveQuery(() => activeSetId ? db.savedSets.get(activeSetId) : Promise.resolve(undefined), [activeSetId])
  const allWeapons   = useLiveQuery(() => db.weapons.toArray(), [])
  const allArmor     = useLiveQuery(() => db.armor.toArray(), [])
  const allSkills    = useLiveQuery(() => db.skills.toArray(), [])
  const allDecos     = useLiveQuery(() => db.decorations.toArray(), [])
  const userTalismans= useLiveQuery(() => db.userTalismans.toArray(), [])
  const userDecos    = useLiveQuery(() => db.userDecos.toArray(), [])

  // Auto-create first set / restore last active
  useEffect(() => {
    if (!savedSets) return
    if (savedSets.length === 0) {
      db.savedSets.add(emptySet('Set 1')).then(id => setActiveSetId(id as number))
    } else if (!activeSetId) {
      setActiveSetId(savedSets[0].id!)
    }
  }, [savedSets, activeSetId])

  // ── Derived selections ──────────────────────────────────────────────────────

  const filteredWeapons = useMemo(() =>
    (allWeapons ?? [])
      .filter(w => w.kind === weaponKind)
      .filter(w => !weaponFilter || w.name.toLowerCase().includes(weaponFilter.toLowerCase())),
    [allWeapons, weaponKind, weaponFilter],
  )

  const selectedWeapon = useMemo(
    () => activeSet?.weaponId ? (allWeapons ?? []).find(w => w.id === activeSet.weaponId) ?? null : null,
    [allWeapons, activeSet?.weaponId],
  )

  const selectedArmor = useMemo(() => {
    const ids = activeSet?.armorIds
    if (!ids || !allArmor) return {} as Record<ArmorSlotKey, ArmorPiece | null>
    return Object.fromEntries(
      ARMOR_SLOTS.map(s => [s, allArmor.find(p => p.id === ids[s]) ?? null])
    ) as Record<ArmorSlotKey, ArmorPiece | null>
  }, [allArmor, activeSet?.armorIds])

  const selectedTalisman = useMemo(
    () => activeSet?.talismanId ? (userTalismans ?? []).find(t => t.id === activeSet.talismanId) ?? null : null,
    [userTalismans, activeSet?.talismanId],
  )

  const isGogma  = selectedWeapon ? GOGMAZIOS_WEAPONS.has(selectedWeapon.name)  : false
  const isArtian = selectedWeapon ? ARTIAN_MAX_WEAPONS.has(selectedWeapon.name) : false

  const activeSkills = useMemo(() => computeSkills(
    selectedWeapon,
    isGogma ? (activeSet?.gogmaSkillIds ?? []) : [],
    ARMOR_SLOTS.map(s => selectedArmor[s] ?? null),
    selectedTalisman,
    activeSet?.decoAssignments ?? [],
    allDecos ?? [],
    allSkills ?? [],
  ), [selectedWeapon, isGogma, activeSet?.gogmaSkillIds, selectedArmor, selectedTalisman, activeSet?.decoAssignments, allDecos, allSkills])

  const defense = useMemo(
    () => computeDefense(ARMOR_SLOTS.map(s => selectedArmor[s] ?? null)),
    [selectedArmor],
  )

  // Skills eligible for gogma picker (searchable)
  const gogmaOpts = useMemo(() => (allSkills ?? []).filter(s =>
    !activeSet?.gogmaSkillIds.includes(s.id)
  ), [allSkills, activeSet?.gogmaSkillIds])

  // ── Set CRUD ────────────────────────────────────────────────────────────────

  async function createSet() {
    const name = `Set ${(savedSets?.length ?? 0) + 1}`
    const id = await db.savedSets.add(emptySet(name))
    setActiveSetId(id as number)
  }

  function deleteSet() {
    if (!activeSetId || (savedSets?.length ?? 0) <= 1) return
    db.savedSets.delete(activeSetId)
    const next = savedSets!.find(s => s.id !== activeSetId)
    setActiveSetId(next?.id ?? null)
  }

  function renameSet(name: string) {
    if (!activeSetId) return
    db.savedSets.update(activeSetId, { name, updatedAt: Date.now() })
  }

  function touch(patch: Partial<SavedSet>) {
    if (!activeSetId) return
    db.savedSets.update(activeSetId, { ...patch, updatedAt: Date.now() })
  }

  // ── Piece selection ─────────────────────────────────────────────────────────

  function pickWeapon(w: Weapon | null) {
    touch({ weaponId: w?.id ?? null, gogmaSkillIds: [], artianAttr: null })
  }

  function pickArmor(slot: ArmorSlotKey, id: number | null) {
    touch({ armorIds: { ...(activeSet?.armorIds ?? { head: null, chest: null, arms: null, waist: null, legs: null }), [slot]: id } })
  }

  function pickTalisman(id: number | null) {
    touch({ talismanId: id, decoAssignments: (activeSet?.decoAssignments ?? []).filter(da => da.pieceKey !== 'talisman') })
  }

  function setGogmaSkill(idx: 0 | 1, skillId: number | null) {
    const ids = [...(activeSet?.gogmaSkillIds ?? [])]
    if (skillId === null) ids.splice(idx, 1)
    else ids[idx] = skillId
    touch({ gogmaSkillIds: ids.slice(0, 2) })
    setGogmaQueries(q => { const n = [...q] as [string, string]; n[idx] = ''; return n })
  }

  function setDeco(pieceKey: DecoAssignment['pieceKey'], slotIndex: number, decorationId: number | null) {
    const rest = (activeSet?.decoAssignments ?? []).filter(
      da => !(da.pieceKey === pieceKey && da.slotIndex === slotIndex)
    )
    if (decorationId !== null) rest.push({ pieceKey, slotIndex, decorationId })
    touch({ decoAssignments: rest })
  }

  function getDecoId(pieceKey: DecoAssignment['pieceKey'], slotIndex: number): number | null {
    return activeSet?.decoAssignments.find(da => da.pieceKey === pieceKey && da.slotIndex === slotIndex)?.decorationId ?? null
  }

  // ── Community ───────────────────────────────────────────────────────────────

  async function loadCommunity() {
    setCommunityLoading(true)
    setCommunityError(null)
    try {
      const builds = await getBuilds({ weapon: commWeaponFilter || undefined, skill: commSkillFilter || undefined, sort: commSort })
      setCommunityBuilds(builds)
    } catch {
      setCommunityError('Could not reach community server. Check VITE_COMMUNITY_API_BASE.')
    } finally {
      setCommunityLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'community') loadCommunity()
  }, [tab, commWeaponFilter, commSkillFilter, commSort])

  async function handleVote(id: string) {
    try {
      const { votes } = await voteBuild(id)
      setCommunityBuilds(bs => bs.map(b => b.id === id ? { ...b, votes } : b))
    } catch { /* ignore */ }
  }

  async function handleClone(build: CommunityBuild) {
    const full = await getBuild(build.id)
    const payload = full.payload as Record<string, unknown> | null
    const name = `${build.title} (clone)`
    const newSet: Omit<SavedSet, 'id'> = {
      ...emptySet(name),
      // best-effort restore from payload if it matches our SavedSet shape
      weaponId:        (payload?.weaponId as number | null) ?? null,
      gogmaSkillIds:   (payload?.gogmaSkillIds as number[]) ?? [],
      artianAttr:      (payload?.artianAttr as ArtianAttr)  ?? null,
      armorIds:        (payload?.armorIds as SavedSet['armorIds']) ?? emptySet(name).armorIds,
      talismanId:      (payload?.talismanId as number | null) ?? null,
      decoAssignments: (payload?.decoAssignments as DecoAssignment[]) ?? [],
    }
    const id = await db.savedSets.add(newSet)
    setActiveSetId(id as number)
    setTab('my-sets')
  }

  async function handlePublish() {
    if (!activeSet || !publishTitle.trim()) return
    setPublishState('sending')
    const payload: BuildSharePayload = {
      title:      publishTitle.trim(),
      weaponKind: selectedWeapon?.kind,
      skills:     activeSkills.map(s => ({ name: s.name, level: s.level })),
      source:     'manual',
      payload:    {
        weaponId:        activeSet.weaponId,
        gogmaSkillIds:   activeSet.gogmaSkillIds,
        artianAttr:      activeSet.artianAttr,
        armorIds:        activeSet.armorIds,
        talismanId:      activeSet.talismanId,
        decoAssignments: activeSet.decoAssignments,
      },
    }
    try {
      const { url } = await postBuild(payload)
      setPublishUrl(url)
      setPublishState('ok')
    } catch {
      setPublishState('error')
    }
  }

  // ── Panel toggle ────────────────────────────────────────────────────────────

  function togglePanel(key: string) {
    setExpanded(e => e === key ? null : key)
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  function renderDecoSlots(
    pieceKey: DecoAssignment['pieceKey'],
    slots: { kind: 'weapon' | 'armor'; size: number }[],
  ) {
    const usable = slots.filter(s => s.size > 0)
    if (!usable.length) return null
    return (
      <div style={{ padding: '6px 10px 8px', borderTop: '1px solid var(--border)', background: 'var(--bg-inset)' }}>
        <div className="overline" style={{ fontSize: 8, marginBottom: 4 }}>Decoration Slots</div>
        {usable.map((s, i) => (
          <DecoSlotRow
            key={i}
            label={s.kind === 'weapon' ? `W${s.size}` : `A${s.size}`}
            slotSize={s.size}
            slotKind={s.kind}
            currentDecoId={getDecoId(pieceKey, i)}
            allDecos={allDecos ?? []}
            userDecos={userDecos ?? []}
            assignments={activeSet?.decoAssignments ?? []}
            onChange={id => setDeco(pieceKey, i, id)}
          />
        ))}
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '12px 12px 80px' }}>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 14, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
        {(['my-sets', 'community'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '8px 0',
              background: tab === t ? 'var(--accent)' : 'var(--bg-inset)',
              border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700,
              letterSpacing: '.1em', textTransform: 'uppercase',
              color: tab === t ? 'var(--bg-base)' : 'var(--fg3)',
            }}
          >
            {t === 'my-sets' ? 'My Sets' : 'Community'}
          </button>
        ))}
      </div>

      {/* ── MY SETS TAB ──────────────────────────────────────────────────── */}
      {tab === 'my-sets' && (
        <>
          {/* Set management row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <select
              value={activeSetId ?? ''}
              onChange={e => setActiveSetId(Number(e.target.value))}
              style={{ ...inp, flex: 1 }}
            >
              {(savedSets ?? []).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              onClick={createSet}
              style={{ padding: '5px 10px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--fg2)', fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '.08em' }}
            >
              + NEW
            </button>
            <button
              onClick={() => {
                const n = prompt('Rename set:', activeSet?.name)
                if (n) renameSet(n)
              }}
              style={{ padding: '5px 10px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--fg3)', fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '.08em' }}
            >
              RENAME
            </button>
            <button
              onClick={deleteSet}
              disabled={(savedSets?.length ?? 0) <= 1}
              style={{ padding: '5px 8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg4)' }}
            >
              <Icon name="trash-2" size={13} />
            </button>
          </div>

          {/* Two-column layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }} className="builder-grid">
            <style>{`@media(min-width:720px){.builder-grid{grid-template-columns:1fr 280px !important;}}`}</style>

            {/* Left: piece panels */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* WEAPON */}
              <div style={panelStyle}>
                <button style={headerBtn} onClick={() => togglePanel('weapon')}>
                  <EquipIcon weaponKind={selectedWeapon?.kind || weaponKind} size={14} />
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--fg2)', flex: 1 }}>WEAPON</span>
                  {selectedWeapon && (
                    <>
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg1)', flex: 2 }}>{selectedWeapon.name}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)' }}>{slotBrackets(selectedWeapon.slots)}</span>
                      {isGogma  && <span style={{ padding: '1px 5px', background: 'rgba(167,139,250,.15)', color: '#a78bfa', borderRadius: 3, fontSize: 9, fontFamily: 'var(--font-mono)' }}>GOGMA</span>}
                      {isArtian && <span style={{ padding: '1px 5px', background: 'rgba(245,158,11,.15)',  color: 'var(--accent)', borderRadius: 3, fontSize: 9, fontFamily: 'var(--font-mono)' }}>ARTIAN</span>}
                    </>
                  )}
                  {!selectedWeapon && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg4)' }}>— none —</span>}
                  <Icon name={expandedPanel === 'weapon' ? 'chevron-up' : 'chevron-down'} size={12} style={{ color: 'var(--fg4)' }} />
                </button>

                {expandedPanel === 'weapon' && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select value={weaponKind} onChange={e => setWeaponKind(e.target.value as WeaponKind)} style={{ ...inp, flex: '0 0 auto', width: 'auto' }}>
                        {WEAPON_KINDS.map(k => <option key={k} value={k}>{k.replace(/-/g, ' ')}</option>)}
                      </select>
                      <input value={weaponFilter} onChange={e => setWeaponFilter(e.target.value)} placeholder="Filter…" style={inp} />
                    </div>
                    {selectedWeapon && (
                      <button onClick={() => pickWeapon(null)} style={{ alignSelf: 'flex-start', padding: '3px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--fg4)', fontSize: 10, fontFamily: 'var(--font-display)', letterSpacing: '.06em' }}>CLEAR</button>
                    )}
                    <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {filteredWeapons.map(w => (
                        <button
                          key={w.id}
                          onClick={() => { pickWeapon(w); setExpanded(null) }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                            background: selectedWeapon?.id === w.id ? 'rgba(245,158,11,.1)' : 'transparent',
                            border: `1px solid ${selectedWeapon?.id === w.id ? 'var(--accent)' : 'transparent'}`,
                            borderRadius: 'var(--r-sm)', cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg1)', flex: 1 }}>{w.name}</span>
                          {GOGMAZIOS_WEAPONS.has(w.name)  && <span style={{ padding: '1px 4px', background: 'rgba(167,139,250,.15)', color: '#a78bfa', borderRadius: 3, fontSize: 8, fontFamily: 'var(--font-mono)' }}>GOGMA</span>}
                          {ARTIAN_MAX_WEAPONS.has(w.name) && <span style={{ padding: '1px 4px', background: 'rgba(245,158,11,.12)', color: 'var(--accent)', borderRadius: 3, fontSize: 8, fontFamily: 'var(--font-mono)' }}>ARTIAN</span>}
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)' }}>{slotBrackets(w.slots)}</span>
                        </button>
                      ))}
                      {filteredWeapons.length === 0 && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg4)', padding: '6px 0' }}>No weapons found</span>}
                    </div>

                    {/* Gogma skill picker */}
                    {isGogma && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                        <div className="overline" style={{ marginBottom: 6, fontSize: 9, color: '#a78bfa' }}>LORD'S SOUL BONUS</div>
                        {([0, 1] as const).map(i => {
                          const pickedSkill = (allSkills ?? []).find(s => s.id === activeSet?.gogmaSkillIds[i])
                          return (
                            <div key={i} style={{ marginBottom: 6 }}>
                              {pickedSkill ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg1)', flex: 1 }}>{pickedSkill.name}</span>
                                  <button onClick={() => setGogmaSkill(i, null)} style={{ background: 'none', border: 'none', color: 'var(--fg4)', cursor: 'pointer', padding: 2 }}><Icon name="x" size={12} /></button>
                                </div>
                              ) : (
                                <div style={{ position: 'relative' }}>
                                  <input
                                    value={gogmaQueries[i]}
                                    onChange={e => { const q = [...gogmaQueries] as [string, string]; q[i] = e.target.value; setGogmaQueries(q) }}
                                    placeholder={`Gogma skill ${i + 1}…`}
                                    style={inp}
                                  />
                                  {gogmaQueries[i] && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', zIndex: 10, maxHeight: 140, overflowY: 'auto' }}>
                                      {gogmaOpts
                                        .filter(s => s.name.toLowerCase().includes(gogmaQueries[i].toLowerCase()))
                                        .slice(0, 8)
                                        .map(s => (
                                          <button key={s.id} onClick={() => setGogmaSkill(i, s.id)}
                                            style={{ display: 'block', width: '100%', padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg1)' }}
                                          >{s.name}</button>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Artian attribute picker */}
                    {isArtian && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                        <div className="overline" style={{ marginBottom: 6, fontSize: 9, color: 'var(--accent)' }}>ARTIAN ATTRIBUTE</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(['Attack', 'Affinity', null] as const).map(attr => (
                            <button
                              key={String(attr)}
                              onClick={() => touch({ artianAttr: attr })}
                              style={{
                                flex: 1, padding: '5px 0',
                                background: activeSet?.artianAttr === attr ? 'var(--accent)' : 'var(--bg-inset)',
                                border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                                color: activeSet?.artianAttr === attr ? 'var(--bg-base)' : 'var(--fg3)',
                                fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '.08em',
                              }}
                            >
                              {attr === null ? 'NONE' : attr === 'Attack' ? 'ATK +5' : 'AFF +5%'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Weapon deco slots */}
                    {selectedWeapon && selectedWeapon.slots.some(s => s > 0) &&
                      renderDecoSlots('weapon', selectedWeapon.slots.map(s => ({ kind: 'weapon' as const, size: s })))
                    }
                  </div>
                )}
              </div>

              {/* ARMOR PANELS */}
              {ARMOR_SLOTS.map(slot => {
                const piece = selectedArmor[slot] ?? null
                const filter = armorFilters[slot] ?? ''
                const filtered = (allArmor ?? [])
                  .filter(p => p.kind === slot)
                  .filter(p => !filter || p.name.toLowerCase().includes(filter.toLowerCase()))

                return (
                  <div key={slot} style={panelStyle}>
                    <button style={headerBtn} onClick={() => togglePanel(slot)}>
                      <EquipIcon armorKind={slot} size={14} />
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--fg2)', width: 44, flexShrink: 0 }}>{SLOT_LABELS[slot]}</span>
                      {piece
                        ? <>
                            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg1)', flex: 1 }}>{piece.name}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)' }}>{slotBrackets(piece.slots)}</span>
                          </>
                        : <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg4)', flex: 1 }}>— none —</span>
                      }
                      <Icon name={expandedPanel === slot ? 'chevron-up' : 'chevron-down'} size={12} style={{ color: 'var(--fg4)' }} />
                    </button>

                    {expandedPanel === slot && (
                      <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            value={filter}
                            onChange={e => setArmorFilters(f => ({ ...f, [slot]: e.target.value }))}
                            placeholder="Filter…"
                            style={inp}
                          />
                          {piece && (
                            <button onClick={() => pickArmor(slot, null)} style={{ padding: '4px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--fg4)', fontSize: 10, fontFamily: 'var(--font-display)', letterSpacing: '.06em', flexShrink: 0 }}>CLEAR</button>
                          )}
                        </div>
                        <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {filtered.map(p => (
                            <button
                              key={p.id}
                              onClick={() => { pickArmor(slot, p.id); setExpanded(null) }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                                background: piece?.id === p.id ? 'rgba(245,158,11,.1)' : 'transparent',
                                border: `1px solid ${piece?.id === p.id ? 'var(--accent)' : 'transparent'}`,
                                borderRadius: 'var(--r-sm)', cursor: 'pointer', textAlign: 'left',
                              }}
                            >
                              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg1)', flex: 1 }}>{p.name}</span>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)' }}>
                                {p.skills.slice(0, 2).map(sl => `${sl.skill.name} ${sl.level}`).join('  ')}
                              </span>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)' }}>{slotBrackets(p.slots)}</span>
                            </button>
                          ))}
                          {filtered.length === 0 && <span style={{ fontSize: 11, color: 'var(--fg4)', fontFamily: 'var(--font-ui)', padding: '4px 0' }}>No pieces found</span>}
                        </div>
                        {piece && piece.slots.some(s => s > 0) &&
                          renderDecoSlots(slot, piece.slots.map(s => ({ kind: 'armor' as const, size: s })))
                        }
                      </div>
                    )}
                  </div>
                )
              })}

              {/* TALISMAN */}
              <div style={panelStyle}>
                <button style={headerBtn} onClick={() => togglePanel('talisman')}>
                  <Icon name="gem" size={14} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--fg2)', flex: 1 }}>TALISMAN</span>
                  {selectedTalisman
                    ? <>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg1)' }}>
                          {selectedTalisman.note || `R${selectedTalisman.rarity} Talisman`}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)', marginLeft: 6 }}>
                          {selectedTalisman.skills.map((ts, i) => {
                            const sk = (allSkills ?? []).find(s => s.id === ts.skillId)
                            return sk ? `${i > 0 ? '· ' : ''}${sk.name} ${ts.level}` : ''
                          }).join('')}
                        </span>
                      </>
                    : <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg4)' }}>— none —</span>
                  }
                  <Icon name={expandedPanel === 'talisman' ? 'chevron-up' : 'chevron-down'} size={12} style={{ color: 'var(--fg4)' }} />
                </button>

                {expandedPanel === 'talisman' && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(userTalismans ?? []).length === 0 && (
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg4)' }}>No talismans — add them in Auto Builder → Talisman Library</span>
                    )}
                    {(userTalismans ?? []).map(t => {
                      const sk0 = (allSkills ?? []).find(s => s.id === t.skills[0]?.skillId)
                      const sk1 = (allSkills ?? []).find(s => s.id === t.skills[1]?.skillId)
                      const isSelected = t.id === activeSet?.talismanId
                      return (
                        <button
                          key={t.id}
                          onClick={() => { pickTalisman(isSelected ? null : t.id!); if (!isSelected) setExpanded(null) }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                            background: isSelected ? 'rgba(245,158,11,.1)' : 'transparent',
                            border: `1px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
                            borderRadius: 'var(--r-sm)', cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)', flexShrink: 0 }}>R{t.rarity}</span>
                          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg1)', flex: 1 }}>
                            {t.note || [sk0?.name, sk1?.name].filter(Boolean).join(' · ') || 'Talisman'}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg3)' }}>
                            {[sk0 && `${sk0.name} ${t.skills[0].level}`, sk1 && `${sk1.name} ${t.skills[1].level}`].filter(Boolean).join('  ')}
                          </span>
                        </button>
                      )
                    })}
                    {selectedTalisman && selectedTalisman.slots.some(s => s.size > 0 || s.type === 'weapon') &&
                      renderDecoSlots('talisman', selectedTalisman.slots.map(s => ({ kind: s.type, size: s.size })))
                    }
                  </div>
                )}
              </div>

              {/* Publish button */}
              <button
                onClick={() => { setPublishTitle(activeSet?.name ?? ''); setPublishState('idle'); setPublishModal(true) }}
                disabled={!activeSkills.length}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '9px 0', marginTop: 4,
                  background: 'var(--bg-inset)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)', cursor: 'pointer',
                  fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '.1em', color: 'var(--fg3)',
                }}
              >
                <Icon name="upload" size={13} />
                PUBLISH TO COMMUNITY
              </button>
            </div>

            {/* Right: skill summary + defense */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* Skill summary */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
                <Overline style={{ marginBottom: 8 }}>Skills</Overline>
                {activeSkills.length === 0 && (
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg4)' }}>Select pieces to see skills</span>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {activeSkills.map(s => (
                    <div key={s.skillId}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg1)', flex: 1 }}>{s.name}</span>
                        {s.overcapped
                          ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '1px 6px', background: 'var(--warning, #ea580c)', color: '#fff', borderRadius: 3 }}>Lv.{s.level}/{s.cap} ▲</span>
                          : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: s.level >= s.cap ? 'var(--success, #10b981)' : 'var(--fg3)' }}>Lv.{s.level}/{s.cap}</span>
                        }
                      </div>
                      <div style={{ height: 3, background: 'var(--bg-inset)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 2,
                          width: `${Math.min(100, (s.level / s.cap) * 100)}%`,
                          background: s.overcapped ? 'var(--warning, #ea580c)' : s.level >= s.cap ? 'var(--success, #10b981)' : 'var(--accent)',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Defense */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
                <Overline style={{ marginBottom: 8 }}>Defense</Overline>
                <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg4)', marginBottom: 2 }}>BASE</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--fg1)' }}>{defense.base}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg4)', marginBottom: 2 }}>MAX</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--fg1)' }}>{defense.max}</div>
                  </div>
                </div>
                <Overline style={{ marginBottom: 4, fontSize: 8 }}>Resistances</Overline>
                {RES_KEYS.map(k => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg4)', width: 56, textTransform: 'uppercase' }}>{k}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: defense.res[k] >= 0 ? 'var(--success, #10b981)' : '#f87171' }}>
                      {defense.res[k] >= 0 ? '+' : ''}{defense.res[k]}
                    </span>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </>
      )}

      {/* ── COMMUNITY TAB ────────────────────────────────────────────────── */}
      {tab === 'community' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Filter row */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select
              value={commWeaponFilter}
              onChange={e => setCommWeaponFilter(e.target.value)}
              style={{ ...inp, flex: '0 0 auto', width: 'auto' }}
            >
              <option value="">All weapons</option>
              {WEAPON_KINDS.map(k => <option key={k} value={k}>{k.replace(/-/g, ' ')}</option>)}
            </select>
            <input
              value={commSkillFilter}
              onChange={e => setCommSkillFilter(e.target.value)}
              placeholder="Search by skill…"
              style={{ ...inp, flex: 1, minWidth: 120 }}
            />
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
              {(['votes', 'new'] as const).map(s => (
                <button key={s} onClick={() => setCommSort(s)} style={{
                  padding: '5px 10px', border: 'none', cursor: 'pointer',
                  background: commSort === s ? 'var(--accent)' : 'var(--bg-inset)',
                  color: commSort === s ? 'var(--bg-base)' : 'var(--fg3)',
                  fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase',
                }}>{s === 'votes' ? 'TOP' : 'NEW'}</button>
              ))}
            </div>
          </div>

          {/* Error / loading */}
          {communityError && (
            <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg3)' }}>
              <Icon name="wifi-off" size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              {communityError}
            </div>
          )}
          {communityLoading && (
            <div style={{ textAlign: 'center', padding: 24, fontFamily: 'var(--font-display)', fontSize: 10, color: 'var(--fg4)', letterSpacing: '.1em' }}>LOADING…</div>
          )}

          {/* Build cards */}
          {!communityLoading && !communityError && communityBuilds.map(b => (
            <CommunityCard key={b.id} build={b} onVote={handleVote} onClone={handleClone} />
          ))}
          {!communityLoading && !communityError && communityBuilds.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, fontFamily: 'var(--font-display)', fontSize: 10, color: 'var(--fg4)', letterSpacing: '.1em' }}>NO BUILDS FOUND</div>
          )}
        </div>
      )}

      {/* ── PUBLISH MODAL ────────────────────────────────────────────────── */}
      {publishModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 20, width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Overline>Publish Build</Overline>

            {publishState === 'ok' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 'var(--r-sm)' }}>
                  <Icon name="circle-check" size={14} style={{ color: 'var(--success, #10b981)' }} />
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--success, #10b981)' }}>Build published!</span>
                </div>
                {publishUrl && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg3)', wordBreak: 'break-all' }}>{publishUrl}</span>}
                <button onClick={() => setPublishModal(false)} style={{ padding: '8px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--bg-base)', fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.08em' }}>CLOSE</button>
              </>
            ) : (
              <>
                <div>
                  <label style={{ fontFamily: 'var(--font-display)', fontSize: 9, color: 'var(--fg4)', letterSpacing: '.1em', display: 'block', marginBottom: 4 }}>TITLE</label>
                  <input
                    value={publishTitle}
                    onChange={e => setPublishTitle(e.target.value)}
                    maxLength={80}
                    placeholder="My Crit Meta Build"
                    style={inp}
                    autoFocus
                  />
                </div>
                {publishState === 'error' && (
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: '#f87171' }}>Upload failed — check backend connection.</span>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setPublishModal(false)} style={{ flex: 1, padding: '8px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--fg3)', fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.08em' }}>CANCEL</button>
                  <button
                    onClick={handlePublish}
                    disabled={!publishTitle.trim() || publishState === 'sending'}
                    style={{ flex: 2, padding: '8px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--bg-base)', fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '.1em' }}
                  >
                    {publishState === 'sending' ? 'PUBLISHING…' : 'PUBLISH'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
