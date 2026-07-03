import { type LucideIcon, icons } from 'lucide-react'

// ── Icon ──────────────────────────────────────────────────────────────────

interface IconProps {
  name: string
  size?: number
  className?: string
  style?: React.CSSProperties
}

export function Icon({ name, size = 16, className, style }: IconProps) {
  const key = name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('') as keyof typeof icons
  const LIcon = icons[key] as LucideIcon | undefined
  if (!LIcon) return null
  return <LIcon size={size} className={className} style={style} strokeWidth={1.75} />
}

// ── Overline label ─────────────────────────────────────────────────────────

export function Overline({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return <div className={`overline${className ? ' ' + className : ''}`} style={style}>{children}</div>
}

// ── Panel ─────────────────────────────────────────────────────────────────

interface PanelProps {
  title?: string
  icon?: string
  action?: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
}

export function Panel({ title, icon, action, children, style, className }: PanelProps) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-sm)',
        ...style,
      }}
      className={className}
    >
      {title && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px',
          borderBottom: '1px solid var(--border)',
        }}>
          {icon && <Icon name={icon} size={14} style={{ color: 'var(--fg3)' }} />}
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--fg2)' }}>
            {title}
          </span>
          <div style={{ flex: 1 }} />
          {action}
        </div>
      )}
      <div style={{ padding: '12px' }}>{children}</div>
    </div>
  )
}

// ── Button ────────────────────────────────────────────────────────────────

type ButtonVariant = 'pri' | 'sec' | 'ghost'

interface ButtonProps {
  variant?: ButtonVariant
  icon?: string
  children?: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  style?: React.CSSProperties
  type?: 'button' | 'submit'
  id?: string
}

const BTN_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  pri:   { background: 'var(--accent)', color: '#000', border: '1px solid var(--accent)' },
  sec:   { background: 'var(--bg-surface-2)', color: 'var(--fg1)', border: '1px solid var(--border)' },
  ghost: { background: 'transparent', color: 'var(--fg2)', border: '1px solid var(--border)' },
}

export function Button({ variant = 'sec', icon, children, onClick, disabled, style, type = 'button', id }: ButtonProps) {
  return (
    <button
      id={id}
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px',
        borderRadius: 'var(--r-sm)',
        fontFamily: 'var(--font-display)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? .45 : 1,
        transition: 'border-color .12s, background .12s',
        ...BTN_STYLES[variant],
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={13} />}
      {children}
    </button>
  )
}

// ── Pill ─────────────────────────────────────────────────────────────────

type PillKind = 'neutral' | 'ok' | 'crit' | 'warn' | 'rare'

const PILL_STYLES: Record<PillKind, { bg: string; color: string; border: string }> = {
  neutral: { bg: 'var(--bg-inset)', color: 'var(--fg2)', border: 'var(--border)' },
  ok:      { bg: 'rgba(16,185,129,.12)', color: 'var(--success)', border: 'rgba(16,185,129,.3)' },
  crit:    { bg: 'rgba(239,68,68,.12)',  color: 'var(--danger)',  border: 'rgba(239,68,68,.3)' },
  warn:    { bg: 'rgba(234,88,12,.12)',  color: 'var(--warning)', border: 'rgba(234,88,12,.3)' },
  rare:    { bg: 'rgba(245,158,11,.12)', color: 'var(--accent)',  border: 'rgba(245,158,11,.3)' },
}

interface PillProps {
  kind?: PillKind
  icon?: string
  children: React.ReactNode
}

export function Pill({ kind = 'neutral', icon, children }: PillProps) {
  const s = PILL_STYLES[kind]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px',
      borderRadius: 'var(--r-pill)',
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
      fontFamily: 'var(--font-display)',
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '.1em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {icon && <Icon name={icon} size={10} />}
      {children}
    </span>
  )
}

// ── Segmented control ──────────────────────────────────────────────────────

interface SegmentedProps<T extends string> {
  options: T[]
  value: T
  onChange: (v: T) => void
  colors?: Partial<Record<T, string>>
}

export function Segmented<T extends string>({ options, value, onChange, colors }: SegmentedProps<T>) {
  return (
    <div style={{
      display: 'flex',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-sm)',
      overflow: 'hidden',
    }}>
      {options.map(o => {
        const on = o === value
        const bg = on ? (colors?.[o] ?? 'var(--accent)') : 'var(--bg-surface)'
        const color = on ? (colors?.[o] ? '#fff' : '#000') : 'var(--fg3)'
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            style={{
              flex: 1,
              padding: '7px 10px',
              background: bg,
              color,
              border: 'none',
              borderRight: '1px solid var(--border)',
              fontFamily: 'var(--font-display)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'background .12s',
            }}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

// ── Element chip ─────────────────────────────────────────────────────────

const EL_COLORS: Record<string, string> = {
  Fire: 'var(--el-fire)', Water: 'var(--el-water)', Thunder: 'var(--el-thunder)',
  Ice: 'var(--el-ice)', Dragon: 'var(--el-dragon)', Poison: 'var(--el-poison)',
  Blast: 'var(--el-blast)',
}

interface ElementChipProps {
  el: string
  rating?: number
}

export function ElementChip({ el, rating }: ElementChipProps) {
  const color = EL_COLORS[el] ?? 'var(--fg3)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: color, flexShrink: 0 }} />
      <span style={{ color: 'var(--fg2)' }}>{el}</span>
      {rating != null && (
        <span style={{ color: rating ? color : 'var(--fg4)', letterSpacing: 1 }}>
          {'★'.repeat(rating) || '—'}
        </span>
      )}
    </span>
  )
}

// ── Stat tile ─────────────────────────────────────────────────────────────

interface StatTileProps {
  label: string
  value: string | number
  unit?: string
  accent?: boolean
}

export function StatTile({ label, value, unit, accent }: StatTileProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Overline>{label}</Overline>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontWeight: 700,
        fontSize: 24,
        lineHeight: 1,
        color: accent ? 'var(--accent)' : 'var(--fg1)',
      }}>
        {value}
        {unit && <span style={{ fontSize: 12, color: 'var(--fg3)', marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  )
}

// ── Equipment icon (weapon / armor) ──────────────────────────────────────

const WEAPON_ICON_MAP: Record<string, string> = {
  'great-sword':      'Great_Sword',
  'sword-shield':     'Sword_and_Shield',
  'dual-blades':      'Dual_Blades',
  'long-sword':       'Long_Sword',
  'hammer':           'Hammer',
  'hunting-horn':     'Hunting_Horn',
  'lance':            'Lance',
  'gunlance':         'Gunlance',
  'switch-axe':       'Switch_Axe',
  'charge-blade':     'Charge_Blade',
  'insect-glaive':    'Insect_Glaive',
  'light-bowgun':     'Light_Bowgun',
  'heavy-bowgun':     'Heavy_Bowgun',
  'bow':              'Bow',
}

const ARMOR_ICON_MAP: Record<string, string> = {
  head:  'Helmet',
  chest: 'Chestplate',
  arms:  'Armguards',
  waist: 'Waist',
  legs:  'Leggings',
}

const EQUIP_ICON_BASE = '/assets/icons/equipment'

export function EquipIcon({
  weaponKind,
  armorKind,
  rarity = 1,
  size = 24,
}: {
  weaponKind?: string
  armorKind?: string
  rarity?: number
  size?: number
}) {
  const prefix = weaponKind ? WEAPON_ICON_MAP[weaponKind] : armorKind ? ARMOR_ICON_MAP[armorKind] : undefined
  if (!prefix) return null
  return (
    <img
      src={`${EQUIP_ICON_BASE}/${prefix}_${rarity}.png`}
      alt=""
      width={size}
      height={size}
      style={{ objectFit: 'contain', display: 'block', imageRendering: 'pixelated' }}
      onError={e => {
        const img = e.currentTarget
        if (!img.src.includes('_Base')) img.src = `${EQUIP_ICON_BASE}/${prefix}_Base.webp`
      }}
    />
  )
}

// ── Input / Select ────────────────────────────────────────────────────────

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  background: 'var(--bg-inset)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--fg1)',
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  outline: 'none',
}
