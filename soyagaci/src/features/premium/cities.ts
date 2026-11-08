import type { GeoPoint, Person } from '../../types'
import { normalizeTr } from '../../lib/format'

// Approximate centres of Turkey's 81 provinces plus cities common in Turkish family histories.
const RAW: [string, number, number][] = [
  ['Adana', 37.0, 35.32], ['Adıyaman', 37.76, 38.28], ['Afyonkarahisar', 38.76, 30.54], ['Afyon', 38.76, 30.54], ['Ağrı', 39.72, 43.05],
  ['Amasya', 40.65, 35.83], ['Ankara', 39.93, 32.86], ['Antalya', 36.89, 30.71], ['Artvin', 41.18, 41.82], ['Aydın', 37.85, 27.85],
  ['Balıkesir', 39.65, 27.88], ['Bilecik', 40.14, 29.98], ['Bingöl', 38.88, 40.5], ['Bitlis', 38.4, 42.11], ['Bolu', 40.74, 31.61],
  ['Burdur', 37.72, 30.29], ['Bursa', 40.19, 29.06], ['Çanakkale', 40.15, 26.41], ['Çankırı', 40.6, 33.62], ['Çorum', 40.55, 34.95],
  ['Denizli', 37.78, 29.09], ['Diyarbakır', 37.91, 40.24], ['Edirne', 41.68, 26.56], ['Elazığ', 38.67, 39.22], ['Erzincan', 39.75, 39.49],
  ['Erzurum', 39.9, 41.27], ['Eskişehir', 39.78, 30.52], ['Gaziantep', 37.07, 37.38], ['Antep', 37.07, 37.38], ['Giresun', 40.91, 38.39],
  ['Gümüşhane', 40.46, 39.48], ['Hakkari', 37.58, 43.74], ['Hatay', 36.2, 36.16], ['Antakya', 36.2, 36.16], ['Isparta', 37.76, 30.55],
  ['Mersin', 36.81, 34.64], ['İçel', 36.81, 34.64], ['İstanbul', 41.01, 28.98], ['İzmir', 38.42, 27.14], ['Kars', 40.6, 43.1],
  ['Kastamonu', 41.38, 33.78], ['Kayseri', 38.72, 35.49], ['Kırklareli', 41.73, 27.22], ['Kırşehir', 39.15, 34.16], ['Kocaeli', 40.77, 29.92],
  ['İzmit', 40.77, 29.92], ['Konya', 37.87, 32.48], ['Kütahya', 39.42, 29.98], ['Malatya', 38.35, 38.31], ['Manisa', 38.61, 27.43],
  ['Kahramanmaraş', 37.58, 36.94], ['Maraş', 37.58, 36.94], ['Mardin', 37.31, 40.74], ['Muğla', 37.22, 28.36], ['Muş', 38.74, 41.49],
  ['Nevşehir', 38.62, 34.71], ['Niğde', 37.97, 34.68], ['Ordu', 40.98, 37.88], ['Rize', 41.02, 40.52], ['Sakarya', 40.78, 30.4],
  ['Adapazarı', 40.78, 30.4], ['Samsun', 41.29, 36.33], ['Siirt', 37.93, 41.94], ['Sinop', 42.03, 35.15], ['Sivas', 39.75, 37.02],
  ['Tekirdağ', 40.98, 27.51], ['Tokat', 40.31, 36.55], ['Trabzon', 41.0, 39.72], ['Tunceli', 39.11, 39.55], ['Şanlıurfa', 37.16, 38.8],
  ['Urfa', 37.16, 38.8], ['Uşak', 38.68, 29.41], ['Van', 38.49, 43.38], ['Yozgat', 39.82, 34.81], ['Zonguldak', 41.45, 31.79],
  ['Aksaray', 38.37, 34.03], ['Bayburt', 40.26, 40.23], ['Karaman', 37.18, 33.22], ['Kırıkkale', 39.85, 33.51], ['Batman', 37.88, 41.13],
  ['Şırnak', 37.52, 42.46], ['Bartın', 41.63, 32.34], ['Ardahan', 41.11, 42.7], ['Iğdır', 39.92, 44.04], ['Yalova', 40.65, 29.27],
  ['Karabük', 41.2, 32.62], ['Kilis', 36.72, 37.12], ['Osmaniye', 37.07, 36.25], ['Düzce', 40.84, 31.16],
  ['Köln', 50.94, 6.96], ['Koln', 50.94, 6.96], ['Berlin', 52.52, 13.4], ['Münih', 48.14, 11.58], ['München', 48.14, 11.58],
  ['Hamburg', 53.55, 9.99], ['Frankfurt', 50.11, 8.68], ['Stuttgart', 48.78, 9.18], ['Düsseldorf', 51.23, 6.77], ['Amsterdam', 52.37, 4.9],
  ['Rotterdam', 51.92, 4.48], ['Brüksel', 50.85, 4.35], ['Viyana', 48.21, 16.37], ['Paris', 48.86, 2.35], ['Londra', 51.51, -0.13],
  ['Stockholm', 59.33, 18.07], ['Lefkoşa', 35.19, 33.36], ['Girne', 35.34, 33.32], ['Bakü', 40.41, 49.87], ['Üsküp', 41.99, 21.43],
  ['Saraybosna', 43.86, 18.41], ['Selanik', 40.64, 22.94], ['Batum', 41.64, 41.64], ['New York', 40.71, -74.01],
]

const INDEX = new Map(RAW.map(([name, lat, lng]) => [normalizeTr(name), { name, lat, lng }]))

/** Finds coordinates for a free-text place such as "Trabzon, Of" or "Köln, Almanya". */
export function geocodePlace(place?: string): GeoPoint | undefined {
  if (!place) return undefined
  const parts = place.split(/[,/()]/).map((x) => normalizeTr(x)).filter(Boolean)
  for (const part of parts) {
    const hit = INDEX.get(part)
    if (hit) return { lat: hit.lat, lng: hit.lng }
  }
  for (const part of parts)
    for (const word of part.split(/[\s-]+/)) {
      const hit = INDEX.get(word)
      if (hit) return { lat: hit.lat, lng: hit.lng }
    }
  return undefined
}

export type GeoLayer = 'birth' | 'residence' | 'burial'

/** Exact coordinates when entered, otherwise a city-centre guess from the place name. */
export function personGeo(p: Person, layer: GeoLayer): { geo: GeoPoint; place: string; approx: boolean } | undefined {
  const exact = layer === 'birth' ? p.birthGeo : layer === 'residence' ? p.residenceGeo : p.burialGeo
  const place = (layer === 'birth' ? p.birthPlace : layer === 'residence' ? p.residence : p.burialPlace) ?? ''
  if (exact) return { geo: exact, place, approx: false }
  const guess = geocodePlace(place)
  return guess ? { geo: guess, place, approx: true } : undefined
}
