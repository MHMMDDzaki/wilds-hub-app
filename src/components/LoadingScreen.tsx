import { useEffect, useState } from 'react'

export function LoadingScreen({ seedDone }: { seedDone: boolean }) {
  const [out, setOut]   = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (!seedDone) return
    setOut(true)
    const t = setTimeout(() => setGone(true), 700)
    return () => clearTimeout(t)
  }, [seedDone])

  if (gone) return null

  return (
    <div className={`lp-splash${out ? ' lp-splash-out' : ''}`} aria-hidden="true">
      <img src="/assets/logo.png" alt="" className="lp-splash-crest" />
      <div className="lp-splash-name">WILDS HUB</div>
      <div className="lp-splash-tagline">Companion Field App</div>
      <div className="lp-splash-bar"><div className="lp-splash-fill" /></div>
    </div>
  )
}
