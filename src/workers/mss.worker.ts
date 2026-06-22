import type { ArmorPiece, Skill, ActiveSkill } from '@/types'

interface MSSRequest {
  type: 'SEARCH'
  targets: { skillId: number; targetLevel: number; name: string }[]
  armor: ArmorPiece[]
  skills: Skill[]
}

self.onmessage = (e: MessageEvent<MSSRequest>) => {
  if (e.data.type !== 'SEARCH') return

  const t0 = performance.now()
  const { targets, armor, skills } = e.data

  const skillIndex = new Map(skills.map(s => [s.id, s]))
  const targetMap  = new Map(targets.map(t => [t.skillId, t.targetLevel]))

  // Group armor by slot type
  const byType: Record<string, ArmorPiece[]> = {}
  for (const piece of armor) {
    ;(byType[piece.kind] ??= []).push(piece)
  }

  const slots = ['head', 'chest', 'arms', 'waist', 'legs'] as const
  const buckets = slots.map(s => byType[s] ?? [])

  // For MVP: score each piece by skill contribution, pick top 3 per slot, enumerate combinations
  const topPerSlot = buckets.map(pieces =>
    pieces
      .map(p => ({
        piece: p,
        score: (p.skills ?? []).reduce((sum, sl) =>
          sum + (targetMap.has(sl.skill.id) ? Math.min(sl.level, targetMap.get(sl.skill.id)!) : 0), 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(x => x.piece)
  )

  // Enumerate combinations (5^5 max = 3125 with top-5 per slot)
  const builds: ActiveSkill[][] = []

  function enumerate(idx: number, chosen: ArmorPiece[]) {
    if (idx === slots.length) {
      const totals = new Map<number, number>()
      for (const piece of chosen) {
        for (const sl of piece.skills ?? []) {
          totals.set(sl.skill.id, (totals.get(sl.skill.id) ?? 0) + sl.level)
        }
      }
      const activeSkills: ActiveSkill[] = [...totals.entries()].map(([id, level]) => {
        const skill = skillIndex.get(id)
        return { skillId: id, name: skill?.name ?? '?', level, cap: skill?.maxLevel ?? 99, overcapped: level > (skill?.maxLevel ?? 99) }
      })
      builds.push(activeSkills)
      return
    }
    for (const piece of topPerSlot[idx]) {
      enumerate(idx + 1, [...chosen, piece])
    }
  }

  enumerate(0, [])

  // Sort by how well targets are met
  builds.sort((a, b) => {
    const scoreA = targets.reduce((sum, t) => {
      const got = a.find(s => s.skillId === t.skillId)?.level ?? 0
      return sum + Math.min(got, t.targetLevel)
    }, 0)
    const scoreB = targets.reduce((sum, t) => {
      const got = b.find(s => s.skillId === t.skillId)?.level ?? 0
      return sum + Math.min(got, t.targetLevel)
    }, 0)
    return scoreB - scoreA
  })

  const durationMs = Math.round(performance.now() - t0)
  // ponytail: returns skill totals only; full build card (armor names) added in next iteration
  self.postMessage({ builds: builds.slice(0, 20), durationMs })
}
