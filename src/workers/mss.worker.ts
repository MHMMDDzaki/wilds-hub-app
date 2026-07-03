import type { ArmorPiece, Skill, ActiveSkill, BuildResult, BuildPiece, SetBonus, UserTalisman, SkillLevel } from '@/types'

interface MSSRequest {
  type: 'SEARCH'
  targets:   { skillId: number; targetLevel: number; name: string }[]
  armor:     ArmorPiece[]
  skills:    Skill[]
  talismans: UserTalisman[]
  weapon:    { skills: SkillLevel[]; slots: number[] } | null
}

self.onmessage = (e: MessageEvent<MSSRequest>) => {
  if (e.data.type !== 'SEARCH') return

  const t0 = performance.now()
  const { targets, armor, skills, talismans, weapon } = e.data

  const skillIndex = new Map(skills.map(s => [s.id, s]))
  const targetMap  = new Map(targets.map(t => [t.skillId, t.targetLevel]))

  // Pre-compute weapon + talisman fixed contributions so armor scoring only
  // scores the REMAINING gap that armor needs to fill
  const fixedContrib = new Map<number, number>()
  if (weapon) {
    for (const sl of weapon.skills) {
      fixedContrib.set(sl.skill.id, (fixedContrib.get(sl.skill.id) ?? 0) + sl.level)
    }
  }
  for (const t of talismans) {
    for (const ts of t.skills) {
      fixedContrib.set(ts.skillId, (fixedContrib.get(ts.skillId) ?? 0) + ts.level)
    }
  }

  const effectiveTargetMap = new Map(
    [...targetMap.entries()].map(([id, lvl]) => [id, Math.max(0, lvl - (fixedContrib.get(id) ?? 0))])
  )

  // Group armor by slot kind
  const byKind: Record<string, ArmorPiece[]> = {}
  for (const piece of armor) {
    ;(byKind[piece.kind] ??= []).push(piece)
  }

  const slots   = ['head', 'chest', 'arms', 'waist', 'legs'] as const
  const buckets = slots.map(s => byKind[s] ?? [])

  // Score pieces against the EFFECTIVE target (after weapon/talisman fixed contribution)
  const topPerSlot = buckets.map(pieces =>
    pieces
      .map(p => ({
        piece: p,
        score: (p.skills ?? []).reduce((sum, sl) =>
          sum + (effectiveTargetMap.has(sl.skill.id)
            ? Math.min(sl.level, effectiveTargetMap.get(sl.skill.id)!)
            : 0), 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(x => x.piece)
  )

  const builds: BuildResult[] = []

  function enumerate(idx: number, chosen: ArmorPiece[]) {
    if (idx === slots.length) {
      // ── Skill aggregation (weapon + armor + talismans) ───────
      const totals = new Map<number, number>()

      if (weapon) {
        for (const sl of weapon.skills) {
          totals.set(sl.skill.id, (totals.get(sl.skill.id) ?? 0) + sl.level)
        }
      }
      for (const piece of chosen) {
        for (const sl of piece.skills ?? []) {
          totals.set(sl.skill.id, (totals.get(sl.skill.id) ?? 0) + sl.level)
        }
      }
      for (const talisman of talismans) {
        for (const ts of talisman.skills) {
          totals.set(ts.skillId, (totals.get(ts.skillId) ?? 0) + ts.level)
        }
      }

      // ── Set bonus detection ──────────────────────────────────
      const setGroups = new Map<number, { name: string; count: number; pieces: ArmorPiece[] }>()
      for (const piece of chosen) {
        if (!piece.armorSet) continue
        const g = setGroups.get(piece.armorSet.id)
        if (g) { g.count++; g.pieces.push(piece) }
        else setGroups.set(piece.armorSet.id, { name: piece.armorSet.name, count: 1, pieces: [piece] })
      }

      const setBonuses: SetBonus[] = []
      for (const [setId, { name: setName, count, pieces: setPieces }] of setGroups) {
        if (count < 2) continue
        const seen        = new Set<number>()
        const bonusSkills: ActiveSkill[] = []

        for (const piece of setPieces) {
          for (const sl of piece.skills ?? []) {
            if (seen.has(sl.skill.id)) continue
            const skill = skillIndex.get(sl.skill.id)
            if (!skill) continue
            const activeRanks = skill.ranks.filter(
              r => r.setPiecesRequired != null && r.setPiecesRequired <= count
            )
            if (activeRanks.length === 0) continue
            seen.add(sl.skill.id)
            const top = activeRanks.reduce((m, r) => r.level > m.level ? r : m)
            bonusSkills.push({
              skillId: sl.skill.id, name: sl.skill.name,
              level: top.level, cap: skill.maxLevel, overcapped: false,
            })
          }
        }

        setBonuses.push({
          setId, setName, pieceCount: count,
          activeThresholds: [2, 4].filter(t => t <= count),
          skills: bonusSkills,
        })
      }

      // ── Defense + resistance aggregation ────────────────────
      const totalDefense = chosen.reduce((sum, p) => sum + p.defense.max, 0)
      const ehp          = Math.round(150 / (80 / (80 + totalDefense)))
      const resistances  = chosen.reduce(
        (acc, p) => ({
          fire:    acc.fire    + p.resistances.fire,
          water:   acc.water   + p.resistances.water,
          thunder: acc.thunder + p.resistances.thunder,
          ice:     acc.ice     + p.resistances.ice,
          dragon:  acc.dragon  + p.resistances.dragon,
        }),
        { fire: 0, water: 0, thunder: 0, ice: 0, dragon: 0 }
      )

      // ── Build pieces ─────────────────────────────────────────
      const pieces: BuildPiece[] = chosen.map(p => ({
        id: p.id, name: p.name, kind: p.kind, rarity: p.rarity,
        armorSetId: p.armorSet?.id ?? null, armorSetName: p.armorSet?.name ?? null,
        defenseMax: p.defense.max, resistances: p.resistances,
        slots: p.slots, skills: p.skills,
      }))

      // ── Active skill list ────────────────────────────────────
      const skillsList: ActiveSkill[] = [...totals.entries()].map(([id, level]) => {
        const skill = skillIndex.get(id)
        return {
          skillId: id, name: skill?.name ?? '?',
          level, cap: skill?.maxLevel ?? 99,
          overcapped: level > (skill?.maxLevel ?? 99),
        }
      })

      // ── Score: how well targets are met ─────────────────────
      const score = targets.reduce((sum, t) => {
        const got = skillsList.find(s => s.skillId === t.skillId)?.level ?? 0
        return sum + Math.min(got, t.targetLevel)
      }, 0)

      builds.push({ pieces, skills: skillsList, totalDefense, effectiveHP: ehp, resistances, setBonuses, score })
      return
    }
    for (const piece of topPerSlot[idx]) enumerate(idx + 1, [...chosen, piece])
  }

  enumerate(0, [])
  builds.sort((a, b) => b.score - a.score)

  self.postMessage({ builds: builds.slice(0, 20), durationMs: Math.round(performance.now() - t0) })
}
