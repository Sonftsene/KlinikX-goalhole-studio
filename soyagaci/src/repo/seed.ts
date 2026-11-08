import type { AppUser, FamilyData, Gender, ParentLink, PartnerLink, PartnerType, Person } from '../types'
import { ADMIN_EMAIL } from '../lib/permissions'

const T0 = '2026-01-01T09:00:00.000Z'

const GEO = {
  trabzon: { lat: 41.0027, lng: 39.7168 },
  rize: { lat: 41.0201, lng: 40.5234 },
  istanbul: { lat: 41.0082, lng: 28.9784 },
  ankara: { lat: 39.9334, lng: 32.8597 },
  izmir: { lat: 38.4237, lng: 27.1428 },
  bursa: { lat: 40.1885, lng: 29.061 },
  koln: { lat: 50.9375, lng: 6.9603 },
}

type P = Partial<Person> & { id: string; firstName: string; lastName: string; gender: Gender }

function person(p: P): Person {
  return { isDeceased: !!p.deathDate, createdAt: T0, updatedAt: T0, ...p }
}

const persons: Person[] = [
  // ── 1. kuşak ──
  person({ id: 'p_mehmet', firstName: 'Mehmet', lastName: 'Yılmaz', gender: 'male', birthDate: '1905-03-12', birthPlace: 'Trabzon, Of', birthGeo: GEO.trabzon, deathDate: '1978-11-02', deathPlace: 'Trabzon', burialPlace: 'Of Merkez Mezarlığı', burialGeo: GEO.trabzon, occupation: 'Çiftçi', hometown: 'Trabzon', bio: 'Ailenin bilinen en eski büyüğü. Fındık bahçeleri ve el yapımı sandıklarıyla tanınırdı.' }),
  person({ id: 'p_fatma', firstName: 'Fatma', lastName: 'Yılmaz', maidenName: 'Kaya', gender: 'female', birthDate: '1910', birthPlace: 'Rize', birthGeo: GEO.rize, deathDate: '1985-02-20', deathPlace: 'Trabzon', occupation: 'Ev hanımı', tags: ['hacı'] }),
  person({ id: 'p_hasan', firstName: 'Hasan', lastName: 'Demir', gender: 'male', birthDate: '1912-07-01', birthPlace: 'Bursa', birthGeo: GEO.bursa, deathDate: '1990-05-15', deathPlace: 'Bursa', occupation: 'Demirci', hometown: 'Bursa' }),
  person({ id: 'p_hatice', firstName: 'Hatice', lastName: 'Demir', maidenName: 'Aksoy', gender: 'female', birthDate: '1915', birthPlace: 'Bursa', birthGeo: GEO.bursa, deathDate: '2001-09-09', deathPlace: 'Bursa' }),

  // ── 2. kuşak ──
  person({ id: 'p_ali', firstName: 'Ali', lastName: 'Yılmaz', gender: 'male', birthDate: '1932-04-23', birthPlace: 'Trabzon', birthGeo: GEO.trabzon, deathDate: '2010-12-01', deathPlace: 'İstanbul', occupation: 'Öğretmen', education: 'Trabzon Öğretmen Okulu', tags: ['ogretmen'], burialPlace: 'Zincirlikuyu Mezarlığı', burialGeo: GEO.istanbul }),
  person({ id: 'p_zeynep', firstName: 'Zeynep', lastName: 'Yılmaz', maidenName: 'Demir', gender: 'female', birthDate: '1936-08-30', birthPlace: 'Bursa', birthGeo: GEO.bursa, deathDate: '2018-03-03', deathPlace: 'İstanbul', occupation: 'Terzi' }),
  person({ id: 'p_ahmet', firstName: 'Ahmet', lastName: 'Yılmaz', gender: 'male', birthDate: '1930-01-10', birthPlace: 'Trabzon', birthGeo: GEO.trabzon, deathDate: '2015-06-18', deathPlace: 'Ankara', occupation: 'Subay (E)', tags: ['gazi'], bio: 'Kore Gazisi. 1950–1953 yılları arasında Kore’de görev yaptı.' }),
  person({ id: 'p_hacer', firstName: 'Hacer', lastName: 'Yılmaz', maidenName: 'Şahin', gender: 'female', birthDate: '1934', deathDate: '1970-01-05', deathPlace: 'Ankara' }),
  person({ id: 'p_nuriye', firstName: 'Nuriye', lastName: 'Yılmaz', maidenName: 'Öztürk', gender: 'female', birthDate: '1940-10-10', birthPlace: 'Ankara', birthGeo: GEO.ankara, deathDate: '2019-04-04' }),
  person({ id: 'p_ayse', firstName: 'Ayşe', lastName: 'Çelik', maidenName: 'Yılmaz', gender: 'female', birthDate: '1938-02-14', birthPlace: 'Trabzon', birthGeo: GEO.trabzon, deathDate: '2020-11-11', deathPlace: 'İzmir' }),
  person({ id: 'p_osman', firstName: 'Osman', lastName: 'Çelik', gender: 'male', birthDate: '1934-05-05', birthPlace: 'İzmir', birthGeo: GEO.izmir, deathDate: '2004-07-07', occupation: 'Tüccar' }),
  person({ id: 'p_mustafa', firstName: 'Mustafa', lastName: 'Demir', gender: 'male', birthDate: '1940-12-12', birthPlace: 'Bursa', birthGeo: GEO.bursa, deathDate: '2022-01-20', occupation: 'Tekstil ustası' }),
  person({ id: 'p_emine', firstName: 'Emine', lastName: 'Demir', maidenName: 'Yıldız', gender: 'female', birthDate: '1945-06-06', birthPlace: 'Bursa', birthGeo: GEO.bursa, residence: 'Bursa', residenceGeo: GEO.bursa }),

  // ── 3. kuşak ──
  person({ id: 'p_murat', firstName: 'Murat', lastName: 'Yılmaz', gender: 'male', birthDate: '1960-09-15', birthPlace: 'İstanbul', birthGeo: GEO.istanbul, occupation: 'Mühendis', education: 'İTÜ İnşaat Mühendisliği', residence: 'İstanbul', residenceGeo: GEO.istanbul, phone: '+90 555 000 00 01' }),
  person({ id: 'p_elif', firstName: 'Elif', lastName: 'Yılmaz', maidenName: 'Arslan', gender: 'female', birthDate: '1963-11-20', birthPlace: 'Ankara', birthGeo: GEO.ankara, occupation: 'Eczacı', residence: 'İstanbul', residenceGeo: GEO.istanbul }),
  person({ id: 'p_selin', firstName: 'Selin', lastName: 'Koç', maidenName: 'Yılmaz', gender: 'female', birthDate: '1965-03-08', birthPlace: 'İstanbul', birthGeo: GEO.istanbul, occupation: 'Doktor', tags: ['doktor'], residence: 'İzmir', residenceGeo: GEO.izmir }),
  person({ id: 'p_burak', firstName: 'Burak', lastName: 'Koç', gender: 'male', birthDate: '1962-01-01', birthPlace: 'İzmir', birthGeo: GEO.izmir, occupation: 'Avukat' }),
  person({ id: 'p_kemal', firstName: 'Kemal', lastName: 'Yılmaz', gender: 'male', birthDate: '1968-07-19', birthPlace: 'İstanbul', birthGeo: GEO.istanbul, deathDate: '1993-10-29', deathPlace: 'Hakkari', tags: ['sehit'], bio: 'Vatani görevi sırasında şehit düştü. Ruhu şad olsun.', burialPlace: 'Edirnekapı Şehitliği', burialGeo: GEO.istanbul }),
  person({ id: 'p_ibrahim', firstName: 'İbrahim', lastName: 'Yılmaz', gender: 'male', birthDate: '1958-02-02', birthPlace: 'Ankara', birthGeo: GEO.ankara, occupation: 'Esnaf', residence: 'Ankara', residenceGeo: GEO.ankara }),
  person({ id: 'p_gul', firstName: 'Gül', lastName: 'Yılmaz', gender: 'female', birthDate: '1974-04-14', birthPlace: 'Ankara', birthGeo: GEO.ankara, occupation: 'Mimar', residence: 'Köln, Almanya', residenceGeo: GEO.koln }),
  person({ id: 'p_deniz', firstName: 'Deniz', lastName: 'Çelik', gender: 'male', birthDate: '1964-08-08', birthPlace: 'İzmir', birthGeo: GEO.izmir, occupation: 'Kaptan' }),
  person({ id: 'p_can', firstName: 'Can', lastName: 'Demir', gender: 'male', birthDate: '1970-10-03', birthPlace: 'Bursa', birthGeo: GEO.bursa, occupation: 'Yazılımcı', residence: 'Bursa', residenceGeo: GEO.bursa }),
  person({ id: 'p_sevgi', firstName: 'Sevgi', lastName: 'Demir', maidenName: 'Ak', gender: 'female', birthDate: '1972-12-25', birthPlace: 'Bursa' }),

  // ── 4. kuşak ──
  person({ id: 'p_emre', firstName: 'Emre', lastName: 'Yılmaz', gender: 'male', birthDate: '1988-05-19', birthPlace: 'İstanbul', birthGeo: GEO.istanbul, occupation: 'Ürün yöneticisi', education: 'Boğaziçi Üniversitesi', residence: 'İstanbul', residenceGeo: GEO.istanbul }),
  person({ id: 'p_merve', firstName: 'Merve', lastName: 'Yılmaz', maidenName: 'Aydın', gender: 'female', birthDate: '1990-02-28', birthPlace: 'İstanbul', occupation: 'Grafik tasarımcı' }),
  person({ id: 'p_zehra', firstName: 'Zehra', lastName: 'Yılmaz', gender: 'female', birthDate: '1992-12-03', birthPlace: 'İstanbul', birthGeo: GEO.istanbul, occupation: 'Öğretmen', tags: ['ogretmen'] }),
  person({ id: 'p_ece', firstName: 'Ece', lastName: 'Koç', gender: 'female', birthDate: '1995-06-21', birthPlace: 'İzmir', birthGeo: GEO.izmir, occupation: 'Veteriner' }),
  person({ id: 'p_onur', firstName: 'Onur', lastName: 'Yılmaz', gender: 'male', birthDate: '1985-09-09', birthPlace: 'Ankara', birthGeo: GEO.ankara }),
  person({ id: 'p_ozan', firstName: 'Ozan', lastName: 'Çelik', gender: 'male', birthDate: '1991-03-30', birthPlace: 'İzmir' }),
  person({ id: 'p_defne', firstName: 'Defne', lastName: 'Demir', gender: 'female', birthDate: '2000-11-08', birthPlace: 'Bursa', birthGeo: GEO.bursa, education: 'Uludağ Üniversitesi' }),

  // ── 5. kuşak ──
  person({ id: 'p_kaan', firstName: 'Ali Kaan', lastName: 'Yılmaz', gender: 'male', birthDate: '2018-08-14', birthPlace: 'İstanbul', birthGeo: GEO.istanbul }),
  person({ id: 'p_naz', firstName: 'Elif Naz', lastName: 'Yılmaz', gender: 'female', birthDate: '2021-11-12', birthPlace: 'İstanbul', birthGeo: GEO.istanbul }),
]

let n = 0
const parent = (parentId: string, childId: string, type: ParentLink['type'] = 'biological'): ParentLink => ({
  id: `r_pc${++n}`,
  kind: 'parent',
  parentId,
  childId,
  type,
})
const couple = (aId: string, bId: string, type: PartnerType = 'married', startDate?: string, endDate?: string): PartnerLink => ({
  id: `r_pt${++n}`,
  kind: 'partner',
  aId,
  bId,
  type,
  startDate,
  endDate,
})
const kids = (fatherId: string, motherId: string, ...children: string[]) =>
  children.flatMap((c) => [parent(fatherId, c), parent(motherId, c)])

const relations = [
  couple('p_mehmet', 'p_fatma', 'married', '1928'),
  couple('p_hasan', 'p_hatice', 'married', '1934'),
  ...kids('p_mehmet', 'p_fatma', 'p_ahmet', 'p_ali', 'p_ayse'),
  ...kids('p_hasan', 'p_hatice', 'p_zeynep', 'p_mustafa'),
  couple('p_ali', 'p_zeynep', 'married', '1958-06-01'),
  couple('p_ahmet', 'p_hacer', 'widowed', '1956', '1970-01-05'),
  couple('p_ahmet', 'p_nuriye', 'married', '1972'),
  couple('p_osman', 'p_ayse', 'married', '1960'),
  couple('p_mustafa', 'p_emine', 'married', '1966'),
  ...kids('p_ali', 'p_zeynep', 'p_murat', 'p_selin', 'p_kemal'),
  ...kids('p_ahmet', 'p_hacer', 'p_ibrahim'),
  ...kids('p_ahmet', 'p_nuriye', 'p_gul'),
  ...kids('p_osman', 'p_ayse', 'p_deniz'),
  ...kids('p_mustafa', 'p_emine', 'p_can'),
  couple('p_murat', 'p_elif', 'married', '1986-09-01'),
  couple('p_burak', 'p_selin', 'divorced', '1993', '2005'),
  couple('p_can', 'p_sevgi', 'married', '1998'),
  ...kids('p_murat', 'p_elif', 'p_emre', 'p_zehra'),
  ...kids('p_burak', 'p_selin', 'p_ece'),
  parent('p_ibrahim', 'p_onur'),
  parent('p_deniz', 'p_ozan'),
  ...kids('p_can', 'p_sevgi', 'p_defne'),
  couple('p_emre', 'p_merve', 'married', '2016-05-21'),
  ...kids('p_emre', 'p_merve', 'p_kaan', 'p_naz'),
]

const users: AppUser[] = [
  { id: 'u_admin', email: ADMIN_EMAIL, displayName: 'Aile Yöneticisi', role: 'admin', status: 'active', personId: 'p_emre', provider: 'demo', createdAt: T0, consentAt: T0 },
  { id: 'u_murat', email: 'murat@ornek.com', displayName: 'Murat Yılmaz', role: 'editor', status: 'active', personId: 'p_murat', provider: 'demo', createdAt: T0, consentAt: T0 },
  { id: 'u_zehra', email: 'zehra@ornek.com', displayName: 'Zehra Yılmaz', role: 'member', status: 'active', personId: 'p_zehra', provider: 'demo', createdAt: T0, consentAt: T0 },
  { id: 'u_defne', email: 'defne@ornek.com', displayName: 'Defne Demir', role: 'member', status: 'active', personId: 'p_defne', provider: 'demo', createdAt: T0, consentAt: T0 },
  { id: 'u_yeni', email: 'ozan@ornek.com', displayName: 'Ozan Çelik', role: 'member', status: 'pending', provider: 'demo', createdAt: '2026-11-01T10:00:00.000Z', consentAt: '2026-11-01T10:00:00.000Z' },
]

export function demoSeed(): FamilyData {
  return {
    persons: structuredClone(persons),
    relations: structuredClone(relations),
    users: structuredClone(users),
    grants: [],
    accessRequests: [
      { id: 'ar_1', userId: 'u_zehra', scope: 'branch', personId: 'p_ece', message: 'Halamın kızı Ece’nin ailesini de görmek istiyorum.', status: 'pending', createdAt: '2026-11-05T12:00:00.000Z' },
    ],
    changeRequests: [
      {
        id: 'cr_1',
        userId: 'u_defne',
        kind: 'update_person',
        personId: 'p_can',
        payload: { occupation: 'Kıdemli yazılım mimarı', residence: 'Bursa, Nilüfer' },
        before: { occupation: 'Yazılımcı', residence: 'Bursa' },
        message: 'Babamın mesleği ve adresi güncel değil.',
        status: 'pending',
        createdAt: '2026-11-06T08:30:00.000Z',
      },
    ],
    audit: [],
    invites: [],
    notifications: [],
    settings: {
      familyName: 'Yılmaz – Demir Ailesi',
      rootPersonId: 'p_emre',
      allowSignup: true,
      hideLivingDetails: true,
      welcomeText: 'Ailemizin hikâyesine hoş geldiniz.',
    },
  }
}

export function emptyData(): FamilyData {
  return {
    persons: [],
    relations: [],
    users: [],
    grants: [],
    accessRequests: [],
    changeRequests: [],
    audit: [],
    invites: [],
    notifications: [],
    settings: { familyName: 'Ailemiz', allowSignup: true, hideLivingDetails: true },
  }
}
