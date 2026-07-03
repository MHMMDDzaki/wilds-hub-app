import { useNavigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { Button, Icon } from '@/components/ui'

const ROUTE: Record<string, string> = {
  sandbox: '/sandbox',
  monster: '/monsters',
  equip:   '/equipment',
  farming: '/favorites',
  sets:    '/builder',
}

const LP_FEATURES = [
  {
    id: 'sandbox', no: '01', icon: 'map', accent: '#f59e0b', short: 'Sandbox',
    over: 'Environmental Sandbox', name: 'Plan the Hunt Before It Begins',
    body: 'Plot pop-up camps across five living regions and watch the ecosystem answer back. Read each seasonal phase, trace the roaming danger zones, and pin your camp clear of apex predators — so you arrive sharpened, supplied, and one step ahead of the wilds.',
    img: `${import.meta.env.BASE_URL}assets/feature_1.jpg`,
  },
  {
    id: 'monster', no: '02', icon: 'crosshair', accent: '#ef4444', short: 'Monster',
    over: 'Monster Field Data', name: 'Know Exactly Where to Strike',
    body: 'Every hitzone, weakness, and break threshold laid out in one tactical field guide. Filter the roster, drill into elemental vulnerabilities, and commit the soft spots to memory — turn a desperate brawl into a clean, deliberate takedown.',
    img: `${import.meta.env.BASE_URL}assets/feature_2.jpg`,
  },
  {
    id: 'equip', no: '03', icon: 'hammer', accent: '#22d3ee', short: 'Equipment',
    over: 'Reinforcement Simulator', name: 'Forge a Weapon That Hits Harder',
    body: 'Reinforce Artian weapons with live EX-smelting math, or socket decoration jewels into any blade and armor piece. Attack, affinity, and element recalculate the instant you change a slot — so you build with certainty, not guesswork.',
    img: `${import.meta.env.BASE_URL}assets/feature_3.jpg`,
  },
  {
    id: 'farming', no: '04', icon: 'package', accent: '#10b981', short: 'Farming',
    over: 'Farming Tracker', name: 'Never Grind the Same Part Twice',
    body: 'Build a material checklist that follows your loadout goals. Add anything from the catalog, set the exact quantities you need, and tick off drops as you carve — every grind has a finish line, and you can see it.',
    img: `${import.meta.env.BASE_URL}assets/feature_4.jpg`,
  },
  {
    id: 'sets', no: '05', icon: 'gem', accent: '#a855f7', short: 'Set Builder',
    over: 'Mixed Set Searcher', name: 'Lock In the Perfect Build',
    body: 'Mix armor across every slot and let the searcher surface the skill spread you are chasing. Weigh defense, resistances, and active skills side by side, then commit to a set that plays exactly the way you want to hunt.',
    img: `${import.meta.env.BASE_URL}assets/feature_5.jpg`,
  },
]

export function LandingScreen() {
  const navigate = useNavigate()
  const go = (id: string) => navigate(ROUTE[id] ?? '/')
  const rootRef = useRef<HTMLDivElement>(null)

  // Scroll-triggered reveal
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target) }
      }),
      { root, threshold: 0.08, rootMargin: '0px 0px -32px 0px' }
    )
    root.querySelectorAll('.lp-feat, .lp-secthead, .lp-band-inner').forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  // Hero parallax
  useEffect(() => {
    const root = rootRef.current
    const bg   = root?.querySelector<HTMLImageElement>('.lp-hero .lp-bg')
    if (!root || !bg) return
    const onScroll = () => {
      bg.style.transform = `translateY(${root.scrollTop * 0.22}px) scale(1.14)`
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="lp-root" ref={rootRef}>
      {/* ── Sticky nav ── */}
      <header className="lp-nav">
        <div className="lp-brand" onClick={() => go('sandbox')} title="Enter Hub">
          <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="Wilds Hub" className="lp-crest-sm" />
        </div>
        <nav className="lp-navlinks">
          {LP_FEATURES.map(f => (
            <button
              key={f.id}
              className="lp-navlink"
              style={{ '--rg': f.accent } as React.CSSProperties}
              onClick={() => go(f.id)}
            >
              {f.short}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="lp-hero">
        <img className="lp-bg" src={`${import.meta.env.BASE_URL}assets/art_1.jpg`} alt="" aria-hidden />
        <div className="lp-scrim lp-scrim-hero" />
        <div className="lp-hero-inner">
          <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="" className="lp-crest-lg" />
          <div className="lp-eyebrow">Companion Field App</div>
          <h1 className="lp-title">WILDS HUB</h1>
          <div className="lp-sub">Master the Hunt</div>
          <p className="lp-lede">
            Five tactical tools, one obsidian dashboard. Plan your camps, read your prey,
            forge your gear, track every drop, and theorycraft the perfect set — Wilds Hub
            turns scattered field notes into a single edge that follows you into every hunt.
          </p>
          <div className="lp-cta">
            <Button variant="pri" icon="compass" onClick={() => go('sandbox')}>Enter the Hub</Button>
            <Button variant="sec" icon="crosshair" onClick={() => go('monster')}>Browse Monster Data</Button>
          </div>
          <div className="lp-stats">
            <div className="lp-stat"><div className="n">5</div><div className="l">Regions</div></div>
            <div className="lp-stat"><div className="n">5</div><div className="l">Tools</div></div>
            <div className="lp-stat"><div className="n">∞</div><div className="l">Loadouts</div></div>
          </div>
        </div>
      </section>

      {/* ── Cinematic band ── */}
      <section className="lp-band lp-band-hunt">
        <img className="lp-bg" src={`${import.meta.env.BASE_URL}assets/art_3.jpg`} alt="" aria-hidden />
        <div className="lp-scrim lp-scrim-hunt" />
        <div className="lp-band-inner">
          <div className="lp-band-eyebrow">From plains to everfrost</div>
          <div className="lp-band-line">Five living regions. Dozens of apex threats. One edge that hunts beside you.</div>
        </div>
      </section>

      {/* ── Features ── */}
      <div className="lp-inner">
        <div className="lp-secthead">
          <div className="k">What's Inside</div>
          <div className="h">Everything for the Field</div>
        </div>

        {LP_FEATURES.map((f, i) => (
          <article
            key={f.id}
            className={`lp-feat${i % 2 === 1 ? ' lp-feat-flip' : ''}`}
            style={{ '--rg': f.accent } as React.CSSProperties}
            onClick={() => go(f.id)}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter') go(f.id) }}
          >
            <div className="lp-feat-media" onClick={e => e.stopPropagation()}>
              <img src={f.img} alt={f.over} className="lp-feat-img" />
            </div>
            <div>
              <div className="lp-feat-num">FEATURE {f.no}</div>
              <div className="lp-feat-kicker">
                <span className="lp-feat-ic"><Icon name={f.icon} size={18} /></span>
                <span className="lp-feat-over">{f.over}</span>
              </div>
              <h3 className="lp-feat-h3">{f.name}</h3>
              <p className="lp-feat-p">{f.body}</p>
              <span className="lp-feat-go">Open {f.over} <Icon name="arrow-right" size={15} /></span>
            </div>
          </article>
        ))}
      </div>

      {/* ── Closing CTA band ── */}
      <section className="lp-band lp-band-close">
        <img className="lp-bg" src={`${import.meta.env.BASE_URL}assets/art_2.jpg`} alt="" aria-hidden />
        <div className="lp-scrim lp-scrim-close" />
        <img className="lp-sigil" src={`${import.meta.env.BASE_URL}assets/wallpaper_landscape.png`} alt="" aria-hidden />
        <div className="lp-band-inner">
          <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="" className="lp-crest-close" />
          <div className="lp-close-h">Ready for the Hunt?</div>
          <p className="lp-close-sub">Every tool, one tap away. Pick where you want to begin.</p>
          <div className="lp-cta">
            <Button variant="pri" icon="compass" onClick={() => go('sandbox')}>Enter the Hub</Button>
            <Button variant="sec" icon="gem" onClick={() => go('sets')}>Open Set Builder</Button>
          </div>
          <div className="lp-foot">
            <div className="overline">Wilds Hub · Tactical Companion · Select a tool to begin</div>
          </div>
        </div>
      </section>
    </div>
  )
}
