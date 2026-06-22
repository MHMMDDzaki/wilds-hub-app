import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { Overline, Panel, Segmented, Pill, Icon } from '@/components/ui'
import { REGION_MAPS, REGION_MAP_INDEX, slugify, APEX_NAMES } from '@/data/regionMaps'
import type { Phase, Monster } from '@/types'

const PHASE_TINT: Record<Phase, string> = {
  Plenty:      'var(--success)',
  Fallow:      'var(--border)',
  Inclemency:  'var(--danger)',
}

function pointInPoly(px: number, py: number, pts: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

function parsePath(d: string): [number, number][] {
  const nums = d.replace(/[MLZ]/g, ' ').trim().split(/\s+/).map(Number)
  const pts: [number, number][] = []
  for (let i = 0; i < nums.length - 1; i += 2) pts.push([nums[i], nums[i + 1]])
  return pts
}

export function HomeScreen() {
  const [regionIdx, setRegionIdx] = useState(0)
  const [phase, setPhase]         = useState<Phase>('Plenty')
  const [pins, setPins]           = useState<{ x: number; y: number }[]>([])

  const region  = REGION_MAPS[regionIdx]
  const mapData = region ? REGION_MAP_INDEX.get(region.locationId) : null
  const tint    = PHASE_TINT[phase]
  const zonePts = mapData?.danger.map(parsePath) ?? []

  const monsters = useLiveQuery<Monster[]>(
    () => db.monsters.toArray(),
    []
  )

  const atRegion = (monsters ?? []).filter(m =>
    region && m.locations?.some((l: { id: number }) => l.id === region.apiId)
  )

  const filtered = atRegion.filter(m => {
    if (phase === 'Inclemency') return APEX_NAMES.has(m.name)
    if (phase === 'Fallow')     return m.kind === 'large' && !APEX_NAMES.has(m.name)
    return true   // Plenty: show all at this location
  }).slice(0, 8)

  const vulnerable = pins.some(p => zonePts.some(z => pointInPoly(p.x, p.y, z)))

  function handleMapClick(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 1000
    const y = ((e.clientY - r.top)  / r.height) * 1000
    setPins(prev => [...prev, { x, y }])
  }

  function changeRegion(i: number) {
    setRegionIdx((i + REGION_MAPS.length) % REGION_MAPS.length)
    setPins([])
  }

  return (
    <div className="page">
      <div className="screen-head">
        <div>
          <Overline>Environmental Sandbox</Overline>
          <div className="h2" style={{ marginTop: 4 }}>Pop-Up Camp Planner</div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setPins([])}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--fg3)', padding: '5px 10px', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }}
        >
          Clear Pins
        </button>
      </div>

      {/* Region carousel */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          position: 'relative', overflow: 'hidden', borderRadius: 'var(--r-sm)',
          border: `1px solid ${region?.accent ?? 'var(--border)'}`,
          height: 100, background: 'var(--bg-inset)',
        }}>
          {region?.img && (
            <img src={region.img} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: .35 }} />
          )}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 12px' }}>
            <button onClick={() => changeRegion(regionIdx - 1)} style={arrowBtn}><Icon name="chevron-left" /></button>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div className="overline" style={{ marginBottom: 4 }}>{String(regionIdx + 1).padStart(2, '0')} / {String(REGION_MAPS.length).padStart(2, '0')}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--fg1)' }}>{region?.locationId.replace(/-/g, ' ')}</div>
            </div>
            <button onClick={() => changeRegion(regionIdx + 1)} style={arrowBtn}><Icon name="chevron-right" /></button>
          </div>
        </div>
      </div>

      {/* Phase selector */}
      <div style={{ marginBottom: 16 }}>
        <Overline style={{ marginBottom: 8 }}>Seasonal Phase</Overline>
        <Segmented<Phase>
          options={['Plenty', 'Fallow', 'Inclemency']}
          value={phase}
          onChange={setPhase}
          colors={{ Plenty: '#10b981', Fallow: '#52525b', Inclemency: '#b91c1c' }}
        />
      </div>

      {vulnerable && (
        <div className="banner banner-danger" style={{ marginBottom: 16 }}>
          <Icon name="siren" size={14} />
          Pop-up camp is vulnerable to immediate destruction by roaming predators.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* SVG map */}
        <Panel title="Vector Coordinate Planner" icon="map">
          <svg
            viewBox="0 0 1000 1000"
            style={{ display: 'block', width: '100%', cursor: 'crosshair', border: `1px solid ${tint}`, borderRadius: 2 }}
            onClick={handleMapClick}
          >
            {/* Grid */}
            {Array.from({ length: 11 }).map((_, i) => (
              <g key={i} stroke="var(--border)" strokeWidth="1">
                <line x1={i * 100} y1="0" x2={i * 100} y2="1000" />
                <line x1="0" y1={i * 100} x2="1000" y2={i * 100} />
              </g>
            ))}
            {/* Danger zones */}
            {mapData?.danger.map((d, i) => (
              <path key={i} d={d} fill="rgba(239,68,68,0.15)" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="6 5" />
            ))}
            {/* Base camp */}
            {mapData?.camp && (
              <>
                <circle cx={mapData.camp.x} cy={mapData.camp.y} r="8" fill="var(--fg3)" />
                <text x={mapData.camp.x + 14} y={mapData.camp.y + 5} fill="var(--fg3)" fontFamily="var(--font-mono)" fontSize="20">{mapData.camp.label}</text>
              </>
            )}
            {/* Pins */}
            {pins.map((p, i) => {
              const bad = zonePts.some(z => pointInPoly(p.x, p.y, z))
              return (
                <g key={i} transform={`translate(${p.x},${p.y})`}>
                  <path d="M0,-26 C12,-26 18,-16 18,-7 C18,4 8,12 0,24 C-8,12 -18,4 -18,-7 C-18,-16 -12,-26 0,-26 Z"
                    fill={bad ? '#ef4444' : (region?.accent ?? 'var(--accent)')} stroke="var(--bg-root)" strokeWidth="2" />
                  <circle cx="0" cy="-7" r="5" fill="var(--bg-root)" />
                </g>
              )
            })}
          </svg>
        </Panel>

        {/* Spawn list */}
        <Panel
          title={phase === 'Inclemency' ? 'Apex Predators' : 'Active Spawns'}
          icon={phase === 'Inclemency' ? 'skull' : 'paw-print'}
        >
          {filtered.length === 0 ? (
            <div className="overline" style={{ textAlign: 'center', padding: '20px 0' }}>No active spawns</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(m => (
                <div key={m.id} style={{
                  padding: '8px 10px',
                  background: 'var(--bg-inset)',
                  border: `1px solid ${APEX_NAMES.has(m.name) ? 'var(--danger)' : 'var(--border)'}`,
                  borderRadius: 'var(--r-sm)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--fg1)', flex: 1 }}>{m.name}</span>
                    {APEX_NAMES.has(m.name)
                      ? <Pill kind="crit" icon="skull">Apex</Pill>
                      : <Pill kind="neutral">{m.kind}</Pill>
                    }
                  </div>
                  <div className="body-sm" style={{ color: 'var(--fg3)', marginTop: 2 }}>{m.species}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

const arrowBtn: React.CSSProperties = {
  background: 'rgba(9,9,11,.6)', border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)', color: 'var(--fg2)', cursor: 'pointer',
  padding: '6px 8px', display: 'flex', alignItems: 'center',
}
