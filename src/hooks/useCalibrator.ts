import { useState, useEffect } from 'react'
import { db } from '@/db'

const PRESETS = {
  std: { contrast: 100, saturation: 100 },
  sat: { contrast: 115, saturation: 140 },
  hc:  { contrast: 130, saturation: 100 },
} as const

type Preset = keyof typeof PRESETS

export function useCalibrator() {
  const [contrast,   setContrast]   = useState(100)
  const [saturation, setSaturation] = useState(100)

  useEffect(() => {
    db.calibrator.get('global').then(s => {
      if (s) { setContrast(s.contrast); setSaturation(s.saturation) }
    })
  }, [])

  function persist(c: number, s: number) {
    setContrast(c); setSaturation(s)
    db.calibrator.put({ id: 'global', contrast: c, saturation: s })
  }

  return {
    contrast,
    saturation,
    setPreset: (p: Preset) => persist(PRESETS[p].contrast, PRESETS[p].saturation),
    setContrast: (c: number) => persist(c, saturation),
    setSaturation: (s: number) => persist(contrast, s),
  }
}
