import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useCalibrator } from '@/hooks/useCalibrator'
import { Icon } from '@/components/ui'

const NAV = [
  { path: '/sandbox',   label: 'Sandbox',  icon: 'map'      },
  { path: '/monsters',  label: 'Monsters', icon: 'book-open'},
  { path: '/equipment', label: 'Equip',    icon: 'sword'    },
  { path: '/favorites', label: 'Farm',     icon: 'star'     },
  { path: '/builder',   label: 'Auto',     icon: 'layers'   },
  { path: '/my-sets',   label: 'Builder',  icon: 'hammer'   },
]

export function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { contrast, saturation, setPreset } = useCalibrator()

  useEffect(() => {
    document.documentElement.style.setProperty('--app-contrast',   `${contrast}%`)
    document.documentElement.style.setProperty('--app-saturation', `${saturation}%`)
  }, [contrast, saturation])

  const active = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/')

  return (
    <div style={{ display: 'flex', width: '100%', minHeight: '100svh', background: 'var(--bg-root)' }}>
      {/* ── Desktop sidebar ──────────────────────────── */}
      <aside style={{
        display: 'none',
        flexDirection: 'column',
        width: 220,
        minHeight: '100svh',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        zIndex: 40,
      }} className="sidebar-desktop">
        {/* Wordmark */}
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <img src="/assets/wordmark.svg" alt="WILDS HUB" style={{ height: 28 }} />
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '8px 0' }}>
          {NAV.map(n => (
            <button
              key={n.path}
              onClick={() => navigate(n.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 16px',
                background: active(n.path) ? 'var(--bg-surface-2)' : 'transparent',
                borderTop: 'none', borderRight: 'none', borderBottom: 'none',
                borderLeft: active(n.path) ? '2px solid var(--accent)' : '2px solid transparent',
                color: active(n.path) ? 'var(--fg1)' : 'var(--fg3)',
                fontFamily: 'var(--font-display)',
                fontSize: 12, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'background .12s, color .12s',
              }}
            >
              <Icon name={n.icon} size={15} />
              {n.label}
            </button>
          ))}
        </nav>

        {/* Calibrator presets */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div className="overline" style={{ marginBottom: 8 }}>Display</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['std', 'sat', 'hc'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                style={{
                  flex: 1, padding: '5px 0',
                  background: 'var(--bg-inset)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)',
                  color: 'var(--fg3)',
                  fontFamily: 'var(--font-display)',
                  fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {p === 'std' ? 'STD' : p === 'sat' ? 'SAT' : 'HC'}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────── */}
      <main style={{ flex: 1, marginLeft: 0, overflowX: 'hidden' }} className="main-content">
        <Outlet />
      </main>

      {/* ── Mobile bottom action bar ──────────────────── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
        display: 'flex',
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border)',
        padding: '0 0 env(safe-area-inset-bottom)',
      }} className="bottom-nav">
        {NAV.map(n => (
          <button
            key={n.path}
            onClick={() => navigate(n.path)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '10px 4px 8px',
              background: 'transparent', border: 'none',
              color: active(n.path) ? 'var(--accent)' : 'var(--fg4)',
              fontFamily: 'var(--font-display)',
              fontSize: 9, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'color .12s',
            }}
          >
            <Icon name={n.icon} size={18} />
            {n.label}
          </button>
        ))}
      </nav>

      {/* ── Responsive: show sidebar ≥ 720px ─────────── */}
      <style>{`
        @media (min-width: 720px) {
          .sidebar-desktop { display: flex !important; }
          .main-content    { margin-left: 220px !important; }
          .bottom-nav      { display: none !important; }
        }
      `}</style>
    </div>
  )
}
