import { useState, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { Overline, Panel, Button, Icon } from '@/components/ui'
import type { Skill, ActiveSkill } from '@/types'

interface SkillTarget { skillId: number; name: string; targetLevel: number }

export function SetBuilderScreen() {
  const [targets,    setTargets]    = useState<SkillTarget[]>([])
  const [skillSearch, setSkillSearch] = useState('')
  const [searching,  setSearching]  = useState(false)
  const [results,    setResults]    = useState<ActiveSkill[][]>([])
  const [searchMs,   setSearchMs]   = useState<number | null>(null)
  const workerRef = useRef<Worker | null>(null)

  const skills      = useLiveQuery(() => db.skills.toArray(), [])
  const talismans   = useLiveQuery(() => db.userTalismans.toArray(), [])
  const armorData   = useLiveQuery(() => db.armor.toArray(), [])

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

  const filteredSkills = (skills ?? []).filter(s =>
    s.name.toLowerCase().includes(skillSearch.toLowerCase()) &&
    !targets.some(t => t.skillId === s.id)
  ).slice(0, 8)

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
      type: 'SEARCH',
      targets,
      armor:  armorData ?? [],
      skills: skills ?? [],
    })
  }

  async function addTalisman() {
    await db.userTalismans.add({ skills: [], slots: [0, 0, 0], note: 'New Talisman' })
  }

  async function removeTalisman(id: number) {
    await db.userTalismans.delete(id)
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
            <div className="overline" style={{ textAlign: 'center', padding: '16px 0', color: 'var(--fg4)' }}>Add skills above to search</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {targets.map(t => {
                const skill = (skills ?? []).find(s => s.id === t.skillId)
                return (
                  <div key={t.skillId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg1)', flex: 1 }}>{t.name}</span>
                    <span className="overline">Lv.</span>
                    <input
                      type="number"
                      min={1}
                      max={skill?.maxLevel ?? 10}
                      value={t.targetLevel}
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

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Button
              variant="pri"
              icon="search"
              onClick={runSearch}
              disabled={targets.length === 0 || searching}
              style={{ flex: 1 }}
              id="mss-search-btn"
            >
              {searching ? 'SEARCHING…' : 'SEARCH BUILDS'}
            </Button>
          </div>

          {searchMs != null && (
            <div className="overline" style={{ marginTop: 8, textAlign: 'right' }}>Query: {searchMs}ms</div>
          )}
        </Panel>

        {/* Talisman library */}
        <Panel title="Talisman Library" icon="gem" action={<Button variant="ghost" icon="plus" onClick={addTalisman}>Add</Button>}>
          {!talismans || talismans.length === 0 ? (
            <div className="overline" style={{ textAlign: 'center', padding: '16px 0', color: 'var(--fg4)' }}>No talismans — tap Add to register owned talismans</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Talisman</th><th style={{ textAlign: 'left' }}>Skills</th><th>Slots</th><th></th></tr>
                </thead>
                <tbody>
                  {talismans.map(t => (
                    <tr key={t.id}>
                      <td>{t.note ?? '—'}</td>
                      <td style={{ textAlign: 'left', color: 'var(--fg2)' }}>
                        {t.skills.length === 0 ? '—' : t.skills.map(s => {
                          const sk = (skills ?? []).find(x => x.id === s.skillId)
                          return sk ? `${sk.name} Lv.${s.level}` : `Skill Lv.${s.level}`
                        }).join(' · ')}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg2)' }}>
                        {t.slots.map(s => s > 0 ? `[${s}]` : '—').join('-')}
                      </td>
                      <td>
                        <button onClick={() => removeTalisman(t.id!)} style={{ background: 'none', border: 'none', color: 'var(--fg4)', cursor: 'pointer', padding: 4 }}>
                          <Icon name="trash-2" size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Results */}
        {results.length > 0 && (
          <Panel title={`Results — ${results.length} builds`} icon="layers">
            <div className="overline" style={{ marginBottom: 12 }}>Skill totals per build (full build display coming soon)</div>
            {results.map((skills, i) => (
              <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', marginBottom: 8 }}>
                <div className="overline" style={{ marginBottom: 6 }}>Build {i + 1}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {skills.map(s => (
                    <div key={s.skillId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg2)', flex: 1 }}>{s.name}</span>
                      {s.overcapped && <Icon name="triangle-alert" size={13} style={{ color: 'var(--warning)' }} />}
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 12, padding: '2px 8px', borderRadius: 4,
                        background: s.overcapped ? 'var(--warning)' : 'var(--bg-surface)',
                        border: s.overcapped ? 'none' : '1px solid var(--border)',
                        color: s.overcapped ? '#fff' : 'var(--fg1)',
                      }}>
                        Lv.{s.level}{s.overcapped ? `/${s.cap}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Panel>
        )}
      </div>
    </div>
  )
}
