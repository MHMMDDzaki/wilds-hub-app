import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useParams, useNavigate } from 'react-router-dom'
import { db } from '@/db'
import { Overline, Panel, Segmented, Pill, ElementChip, Icon, Button } from '@/components/ui'
import type { Monster, MonsterState } from '@/types'

const ELEMENTS = ['Fire', 'Water', 'Thunder', 'Ice', 'Dragon', 'Poison', 'Blast']

export function MonsterScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [search,        setSearch]        = useState('')
  const [species,       setSpecies]       = useState<string | null>(null)
  const [monsterState,  setMonsterState]  = useState<MonsterState>('Normal')
  const [hitzoneTab,    setHitzoneTab]    = useState<'physical' | 'elemental'>('physical')

  const monsters = useLiveQuery(() => db.monsters.toArray(), [])
  const selected = useLiveQuery<Monster | undefined>(
    () => id ? db.monsters.get(Number(id)) : Promise.resolve(undefined),
    [id]
  )

  const speciesList = useMemo(() =>
    [...new Set((monsters ?? []).map(m => m.species).filter(Boolean))].sort(),
    [monsters]
  )

  const filtered = (monsters ?? []).filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) &&
    (species == null || m.species === species)
  )

  // ── Detail view ─────────────────────────────────────────────

  if (selected) {
    const weaknesses = selected.weaknesses ?? []
    const rewards    = selected.rewards    ?? []
    const parts      = selected.parts      ?? []

    return (
      <div className="page">
        <div className="screen-head">
          <Button icon="arrow-left" variant="ghost" onClick={() => navigate('/monsters')}>Back</Button>
          <div style={{ flex: 1 }}>
            <Overline>Monster Field Data</Overline>
            <div className="h2" style={{ marginTop: 4 }}>{selected.name}</div>
          </div>
          <Pill kind="neutral">{selected.kind}</Pill>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Overline style={{ marginBottom: 8 }}>Monster State</Overline>
          <Segmented<MonsterState>
            options={['Normal', 'Enraged', 'Wounded']}
            value={monsterState}
            onChange={setMonsterState}
          />
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {/* Hitzone table — split physical/elemental for mobile */}
          <Panel title="Hitzone Data" icon="target">
            {parts.length > 0 ? (
              <>
                <div style={{ marginBottom: 10 }}>
                  <Segmented<'physical' | 'elemental'>
                    options={['physical', 'elemental']}
                    value={hitzoneTab}
                    onChange={setHitzoneTab}
                  />
                </div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      {hitzoneTab === 'physical' ? (
                        <tr><th>Part</th><th>Slash</th><th>Blunt</th><th>Pierce</th><th>Stun</th></tr>
                      ) : (
                        <tr><th>Part</th><th>Fire</th><th>Water</th><th>Thun</th><th>Ice</th><th>Dragon</th></tr>
                      )}
                    </thead>
                    <tbody>
                      {parts.map(part => {
                        const m = part.multipliers
                        const pct = (v: number) => Math.round(v * 100)
                        const wounded = monsterState === 'Wounded'
                        return (
                          <tr key={part.id} className={wounded ? 'hitzone-wounded' : ''}>
                            <td>{part.name}</td>
                            {hitzoneTab === 'physical' ? (
                              <>
                                <td>{m ? pct(m.slash)   : '—'}</td>
                                <td>{m ? pct(m.blunt)   : '—'}</td>
                                <td>{m ? pct(m.pierce)  : '—'}</td>
                                <td>{m ? pct(m.stun)    : '—'}</td>
                              </>
                            ) : (
                              <>
                                <td>{m ? pct(m.fire)    : '—'}</td>
                                <td>{m ? pct(m.water)   : '—'}</td>
                                <td>{m ? pct(m.thunder) : '—'}</td>
                                <td>{m ? pct(m.ice)     : '—'}</td>
                                <td>{m ? pct(m.dragon)  : '—'}</td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="overline" style={{ textAlign: 'center', padding: '16px 0' }}>Hitzone data not available</div>
            )}
          </Panel>

          {/* Elemental weaknesses */}
          <Panel title="Elemental Weakness" icon="zap">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {ELEMENTS.map(el => {
                const w = weaknesses.find(x => x.element?.toLowerCase() === el.toLowerCase())
                return <ElementChip key={el} el={el} rating={w?.level ?? 0} />
              })}
            </div>
          </Panel>

          {/* Rewards — card layout for mobile readability */}
          <Panel title="Reward Table" icon="package">
            {rewards.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rewards.flatMap((r, ri) =>
                  r.conditions.map((c, ci) => (
                    <div key={`${ri}-${ci}`} style={{ padding: '8px 10px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg1)', flex: 1 }}>{r.item.name}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: c.chance < 10 ? 'var(--fg3)' : c.chance < 30 ? 'var(--fg2)' : 'var(--accent)' }}>
                          {c.chance}%
                        </span>
                        {c.chance < 10 && <Pill kind="warn">RARE</Pill>}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span className="overline" style={{ color: 'var(--fg4)' }}>{c.kind}</span>
                        <span className="overline" style={{ color: 'var(--fg4)' }}>·</span>
                        <span className="overline" style={{ color: 'var(--fg4)' }}>{c.rank}</span>
                        <span className="overline" style={{ color: 'var(--fg4)' }}>·</span>
                        <span className="overline" style={{ color: 'var(--fg4)' }}>×{c.quantity}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="overline" style={{ textAlign: 'center', padding: '16px 0' }}>No reward data</div>
            )}
          </Panel>
        </div>
      </div>
    )
  }

  // ── List view ────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="screen-head">
        <div>
          <Overline>Database</Overline>
          <div className="h2" style={{ marginTop: 4 }}>Monster Encyclopedia</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Icon name="search" size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg4)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search monsters…"
            style={{ width: '100%', padding: '7px 10px 7px 30px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--fg1)', fontFamily: 'var(--font-ui)', fontSize: 13 }}
          />
        </div>
        <select
          value={species ?? ''}
          onChange={e => setSpecies(e.target.value || null)}
          style={{ padding: '7px 10px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--fg2)', fontFamily: 'var(--font-ui)', fontSize: 12 }}
        >
          <option value="">All Species</option>
          {speciesList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <Panel>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Monster</th><th>Species</th><th>Type</th><th>Weaknesses</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--fg4)', padding: '20px' }}>
                  {monsters == null ? 'Loading…' : 'No monsters found'}
                </td></tr>
              ) : filtered.map(m => (
                <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/monsters/${m.id}`)}>
                  <td style={{ color: 'var(--fg1)', fontFamily: 'var(--font-display)', letterSpacing: '.04em', textTransform: 'uppercase', fontSize: 13 }}>{m.name}</td>
                  <td style={{ textAlign: 'left', color: 'var(--fg3)' }}>{m.species}</td>
                  <td style={{ textAlign: 'left' }}><Pill kind="neutral">{m.kind}</Pill></td>
                  <td style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(m.weaknesses ?? [])
                        .filter(w => w.element && w.level >= 2)
                        .map(w => <ElementChip key={w.id} el={w.element!} rating={w.level} />)
                      }
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
