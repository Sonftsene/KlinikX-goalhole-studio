import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { MapPin } from 'lucide-react'
import type { Person } from '../types'
import { useT } from '../lib/i18n'
import { displayName, lifeSpan } from '../lib/format'
import { Badge, EmptyState, PageHeader, cx } from '../components/ui'
import { Avatar } from '../components/person/Avatar'
import { useVisibleGraph } from '../features/premium/useVisibleGraph'
import { type GeoLayer, personGeo } from '../features/premium/cities'

const LAYERS: { key: GeoLayer; color: string; emoji: string; tr: string; en: string }[] = [
  { key: 'birth', color: '#0d9488', emoji: '👶', tr: 'Doğum yeri', en: 'Birthplace' },
  { key: 'residence', color: '#2563eb', emoji: '🏠', tr: 'Yaşadığı yer', en: 'Residence' },
  { key: 'burial', color: '#64748b', emoji: '🕊', tr: 'Defin yeri', en: 'Burial' },
]

interface Spot {
  key: string
  lat: number
  lng: number
  place: string
  approx: boolean
  items: { person: Person; layer: GeoLayer }[]
}

function iconFor(spot: Spot) {
  const layers = [...new Set(spot.items.map((i) => i.layer))]
  const color = layers.length === 1 ? LAYERS.find((l) => l.key === layers[0])!.color : '#7c3aed'
  const n = spot.items.length
  const size = n > 9 ? 40 : n > 1 ? 34 : 28
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font:600 13px system-ui,sans-serif;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${n > 1 ? n : ''}</div>`,
  })
}

function FitBounds({ spots }: { spots: Spot[] }) {
  const map = useMap()
  const sig = spots.map((s) => s.key).join('|')
  useEffect(() => {
    if (!spots.length) return
    if (spots.length === 1) map.setView([spots[0].lat, spots[0].lng], 8)
    else map.fitBounds(L.latLngBounds(spots.map((s) => [s.lat, s.lng] as [number, number])), { padding: [40, 40], maxZoom: 9 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, map])
  return null
}

export default function MapPage() {
  const t = useT()
  const { persons } = useVisibleGraph()
  const [active, setActive] = useState<Record<GeoLayer, boolean>>({ birth: true, residence: true, burial: false })

  const { spots, missing } = useMemo(() => {
    const map = new Map<string, Spot>()
    let missing = 0
    for (const p of persons) {
      let any = false
      for (const l of LAYERS) {
        if (!active[l.key]) continue
        const g = personGeo(p, l.key)
        if (!g) continue
        any = true
        const key = `${g.geo.lat.toFixed(3)},${g.geo.lng.toFixed(3)}`
        const spot = map.get(key) ?? { key, lat: g.geo.lat, lng: g.geo.lng, place: g.place, approx: g.approx, items: [] }
        if (!spot.items.some((i) => i.person.id === p.id && i.layer === l.key)) spot.items.push({ person: p, layer: l.key })
        spot.approx = spot.approx && g.approx
        map.set(key, spot)
      }
      if (!any) missing++
    }
    return { spots: [...map.values()], missing }
  }, [persons, active])

  const counts = useMemo(() => {
    const c: Record<GeoLayer, number> = { birth: 0, residence: 0, burial: 0 }
    for (const p of persons) for (const l of LAYERS) if (personGeo(p, l.key)) c[l.key]++
    return c
  }, [persons])

  return (
    <div>
      <PageHeader title={t('Aile haritası', 'Family map')} subtitle={t('Ailenin doğduğu, yaşadığı ve defnedildiği yerler', 'Where the family was born, lived and rests')} />
      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
        {LAYERS.map((l) => (
          <button
            key={l.key}
            onClick={() => setActive((a) => ({ ...a, [l.key]: !a[l.key] }))}
            className={cx(
              'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition',
              active[l.key] ? 'border-transparent text-white' : 'border-slate-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
            )}
            style={active[l.key] ? { background: l.color } : undefined}
          >
            <span>{l.emoji}</span>
            {t(l.tr, l.en)}
            <span className={cx('rounded-full px-1.5 text-xs', active[l.key] ? 'bg-white/25' : 'bg-slate-100 dark:bg-slate-800')}>{counts[l.key]}</span>
          </button>
        ))}
      </div>

      {!persons.length ? (
        <EmptyState icon={<MapPin size={40} />} title={t('Henüz kişi yok', 'No people yet')} />
      ) : (
        <div className="card relative isolate overflow-hidden" style={{ height: 'min(68dvh, 640px)', minHeight: 360 }}>
          <MapContainer center={[39.0, 35.0]} zoom={5} scrollWheelZoom className="h-full w-full" style={{ height: '100%', width: '100%' }}>
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FitBounds spots={spots} />
            {spots.map((s) => (
              <Marker key={s.key} position={[s.lat, s.lng]} icon={iconFor(s)}>
                <Popup maxWidth={280} minWidth={220}>
                  <div className="font-sans">
                    <div className="mb-1 text-sm font-semibold text-slate-900">
                      📍 {s.place || t('Konum', 'Location')} {s.approx && <span className="text-xs font-normal text-slate-500">({t('şehir merkezi', 'city centre')})</span>}
                    </div>
                    <div className="max-h-56 space-y-1 overflow-y-auto">
                      {s.items.map(({ person, layer }) => (
                        <Link key={person.id + layer} to={`/kisi/${person.id}`} className="flex items-center gap-2 rounded-lg p-1 !text-slate-900 no-underline hover:bg-slate-100">
                          <Avatar person={person} size={30} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">{displayName(person)}</span>
                            <span className="block text-[11px] text-slate-500">
                              {LAYERS.find((l) => l.key === layer)!.emoji} {t(LAYERS.find((l) => l.key === layer)!.tr, LAYERS.find((l) => l.key === layer)!.en)} · {lifeSpan(person)}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          {!spots.length && (
            <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center p-6">
              <div className="rounded-2xl bg-white/95 px-4 py-3 text-center text-sm shadow dark:bg-slate-900/95">{t('Seçili katmanlarda konum yok.', 'No locations in the selected layers.')}</div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Badge color="brand">{spots.length} {t('konum', 'places')}</Badge>
        {!!missing && (
          <span>
            {t(`${missing} kişinin seçili katmanlarda yeri yok — profillerine şehir eklendiğinde haritada görünürler.`, `${missing} people have no place in these layers yet.`)}
          </span>
        )}
      </div>
    </div>
  )
}
