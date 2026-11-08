import { useRef, useState } from 'react'
import { Database, Download, FileJson, FileSpreadsheet, FileUp, GitBranch, Upload } from 'lucide-react'
import type { FamilyData, Person, Relation } from '../../types'
import { useFamily } from '../../store/useFamily'
import { useT } from '../../lib/i18n'
import { Badge, Button, PageHeader, Segmented, Sheet, attempt, confirmAction, toast } from '../../components/ui'
import { Avatar } from '../../components/person/Avatar'
import { displayName, lifeSpan } from '../../lib/format'
import { isAdmin } from '../../lib/permissions'
import { parseGedcom, toGedcom } from '../../lib/gedcom'
import { download } from './shared'

interface Preview {
  source: 'gedcom' | 'json'
  fileName: string
  persons: Person[]
  relations: Relation[]
  warnings: string[]
  settings?: FamilyData['settings']
}

function stamp() {
  return new Date().toISOString().slice(0, 10)
}

function slug(s: string) {
  return (s || 'soyagaci')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function personsToCsv(persons: Person[], parentsOf: (id: string) => string[], partnersOf: (id: string) => string[], nameOf: (id: string) => string): string {
  const header = ['Ad', 'Soyad', 'Kızlık soyadı', 'Lakap', 'Cinsiyet', 'Doğum tarihi', 'Doğum yeri', 'Vefat', 'Vefat tarihi', 'Vefat yeri', 'Defin yeri', 'Meslek', 'Eğitim', 'Memleket', 'İkamet', 'Telefon', 'E-posta', 'Anne/Baba', 'Eş(ler)', 'Etiketler', 'Biyografi', 'Kimlik']
  const rows = persons.map((p) =>
    [
      p.firstName,
      p.lastName,
      p.maidenName,
      p.nickname,
      p.gender === 'male' ? 'Erkek' : p.gender === 'female' ? 'Kadın' : 'Diğer',
      p.birthDate,
      p.birthPlace,
      p.isDeceased ? 'Evet' : 'Hayır',
      p.deathDate,
      p.deathPlace,
      p.burialPlace,
      p.occupation,
      p.education,
      p.hometown,
      p.residence,
      p.phone,
      p.email,
      parentsOf(p.id).map(nameOf).join(', '),
      partnersOf(p.id).map(nameOf).join(', '),
      (p.tags ?? []).join(', '),
      p.bio,
      p.id,
    ]
      .map(csvCell)
      .join(';'),
  )
  return '﻿' + [header.join(';'), ...rows].join('\r\n')
}

export default function ImportExport() {
  const t = useT()
  const me = useFamily((s) => s.user)
  const data = useFamily((s) => s.data)
  const graph = useFamily((s) => s.graph)
  const { importData, saveSettings } = useFamily.getState()
  const gedRef = useRef<HTMLInputElement>(null)
  const jsonRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [busy, setBusy] = useState(false)
  const name = slug(data.settings.familyName)

  const nameOf = (id: string) => {
    const p = graph.persons.get(id)
    return p ? `${p.firstName} ${p.lastName}` : ''
  }
  const parentsOf = (id: string) => (graph.parents.get(id) ?? []).map((l) => l.parentId)
  const partnersOf = (id: string) => (graph.partners.get(id) ?? []).map((l) => (l.aId === id ? l.bId : l.aId))

  const exportJson = () => {
    const backup = {
      app: 'soyagaci',
      version: 1,
      exportedAt: new Date().toISOString(),
      ...data,
    }
    download(`${name}-yedek-${stamp()}.json`, JSON.stringify(backup, null, 2), 'application/json')
    toast.success(t('Yedek indirildi', 'Backup downloaded'))
  }
  const exportGedcom = () => {
    download(`${name}-${stamp()}.ged`, toGedcom(data.persons, data.relations, data.settings.familyName), 'text/plain;charset=utf-8')
    toast.success(t('GEDCOM dosyası indirildi', 'GEDCOM file downloaded'))
  }
  const exportCsv = () => {
    download(`${name}-kisiler-${stamp()}.csv`, personsToCsv(data.persons, parentsOf, partnersOf, nameOf), 'text/csv;charset=utf-8')
    toast.success(t('Excel (CSV) dosyası indirildi', 'Excel (CSV) file downloaded'))
  }

  const readFile = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(r.error)
      r.readAsText(file)
    })

  const onGedcom = async (file?: File) => {
    if (!file) return
    const res = await attempt(async () => {
      const text = await readFile(file)
      return parseGedcom(text)
    })
    if (res) setPreview({ source: 'gedcom', fileName: file.name, ...res })
    if (gedRef.current) gedRef.current.value = ''
  }

  const onJson = async (file?: File) => {
    if (!file) return
    const res = await attempt(async () => {
      const raw = JSON.parse(await readFile(file)) as Partial<FamilyData>
      if (!Array.isArray(raw.persons) || !Array.isArray(raw.relations)) throw new Error(t('Geçersiz yedek dosyası: kişi veya bağlantı listesi yok.', 'Invalid backup: missing persons or relations.'))
      return raw
    })
    if (res) setPreview({ source: 'json', fileName: file.name, persons: res.persons!, relations: res.relations!, warnings: [], settings: res.settings })
    if (jsonRef.current) jsonRef.current.value = ''
  }

  const runImport = async () => {
    if (!preview) return
    if (mode === 'replace' && !confirmAction(t('Mevcut tüm kişiler ve bağlantılar silinip dosyadakilerle değiştirilecek. Emin misiniz?', 'All current persons and links will be replaced. Are you sure?'))) return
    setBusy(true)
    const ok = await attempt(async () => {
      await importData(preview.persons, preview.relations, mode)
      if (preview.settings && isAdmin(me)) await saveSettings(preview.settings)
      return true
    }, t(`${preview.persons.length} kişi içe aktarıldı`, `${preview.persons.length} people imported`))
    setBusy(false)
    if (ok) setPreview(null)
  }

  const tiles = [
    { icon: FileJson, title: t('Tam yedek (JSON)', 'Full backup (JSON)'), text: t('Kişiler, bağlantılar, kullanıcılar, izinler ve ayarlar.', 'Persons, links, users, grants and settings.'), action: exportJson },
    { icon: GitBranch, title: 'GEDCOM (.ged)', text: t('MyHeritage, Ancestry, FamilySearch, Gramps ile uyumlu.', 'Works with MyHeritage, Ancestry, FamilySearch, Gramps.'), action: exportGedcom },
    { icon: FileSpreadsheet, title: t('Excel (CSV)', 'Excel (CSV)'), text: t('Tüm kişiler tablo olarak, Türkçe Excel uyumlu.', 'All persons as a table, Excel-friendly.'), action: exportCsv },
  ]

  return (
    <div>
      <PageHeader title={t('İçe / dışa aktar', 'Import / export')} subtitle={t('Yedek alın, başka sitelerden ağaç taşıyın', 'Back up, or move trees from other sites')} />

      <h2 className="section-title">{t('Dışa aktar', 'Export')}</h2>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {tiles.map((x) => (
          <button key={x.title} onClick={x.action} className="card flex items-start gap-3 p-4 text-left transition hover:border-brand-400">
            <x.icon size={22} className="mt-0.5 shrink-0 text-brand-700 dark:text-brand-300" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-semibold">
                {x.title} <Download size={14} className="text-slate-400" />
              </div>
              <div className="text-xs text-slate-500">{x.text}</div>
            </div>
          </button>
        ))}
      </div>

      <h2 className="section-title">{t('İçe aktar', 'Import')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={() => gedRef.current?.click()} className="card flex items-start gap-3 p-4 text-left transition hover:border-brand-400">
          <FileUp size={22} className="mt-0.5 shrink-0 text-brand-700 dark:text-brand-300" />
          <div>
            <div className="font-semibold">{t('GEDCOM dosyası yükle', 'Upload GEDCOM file')}</div>
            <div className="text-xs text-slate-500">{t('Başka bir soyağacı sitesinden indirdiğiniz .ged dosyası', 'A .ged file from another genealogy site')}</div>
          </div>
        </button>
        <button onClick={() => jsonRef.current?.click()} className="card flex items-start gap-3 p-4 text-left transition hover:border-brand-400">
          <Database size={22} className="mt-0.5 shrink-0 text-brand-700 dark:text-brand-300" />
          <div>
            <div className="font-semibold">{t('Yedekten geri yükle', 'Restore from backup')}</div>
            <div className="text-xs text-slate-500">{t('Bu uygulamadan alınmış JSON yedeği', 'A JSON backup from this app')}</div>
          </div>
        </button>
      </div>
      <input ref={gedRef} type="file" accept=".ged,.gedcom,text/plain" className="hidden" onChange={(e) => onGedcom(e.target.files?.[0])} />
      <input ref={jsonRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => onJson(e.target.files?.[0])} />
      <p className="mt-3 text-xs text-slate-500">
        {t('Not: JSON geri yüklemede kişiler, bağlantılar ve aile ayarları geri yüklenir. Kullanıcı hesapları güvenlik nedeniyle geri yüklenmez.', 'Note: JSON restore brings back persons, links and family settings. User accounts are not restored for security.')}
      </p>

      <Sheet
        open={!!preview}
        onClose={() => setPreview(null)}
        title={t('İçe aktarma önizlemesi', 'Import preview')}
        wide
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setPreview(null)}>
              {t('Vazgeç', 'Cancel')}
            </Button>
            <Button className="flex-1" icon={<Upload size={17} />} loading={busy} onClick={runImport} disabled={!preview?.persons.length}>
              {t('İçe aktar', 'Import')}
            </Button>
          </>
        }
      >
        {preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge color="brand">{preview.fileName}</Badge>
              <Badge color="blue">{t(`${preview.persons.length} kişi`, `${preview.persons.length} people`)}</Badge>
              <Badge>{t(`${preview.relations.length} bağlantı`, `${preview.relations.length} links`)}</Badge>
              {preview.warnings.length > 0 && <Badge color="amber">{t(`${preview.warnings.length} uyarı`, `${preview.warnings.length} warnings`)}</Badge>}
            </div>
            <div>
              <span className="label">{t('Yöntem', 'Mode')}</span>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'merge', label: t('Mevcut ağaca ekle', 'Merge into tree') },
                  { value: 'replace', label: t('Tümünü değiştir', 'Replace all') },
                ]}
              />
              <p className="mt-1 text-xs text-slate-500">
                {mode === 'merge'
                  ? t('Aynı kimlikli kayıtlar güncellenir, yeniler eklenir. Sonra "Mükerrer kayıtlar" ekranından birleştirebilirsiniz.', 'Records with the same id are updated, new ones added. Merge duplicates afterwards.')
                  : t('Mevcut tüm kişi ve bağlantılar silinir.', 'All existing persons and links are deleted.')}
              </p>
            </div>
            {preview.warnings.length > 0 && (
              <details className="rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                <summary className="cursor-pointer font-medium">{t('Uyarılar', 'Warnings')}</summary>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                  {preview.warnings.slice(0, 50).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
            <div>
              <span className="label">{t('İlk kişiler', 'First people')}</span>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {preview.persons.slice(0, 12).map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <Avatar person={p} size={32} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{displayName(p)}</div>
                      <div className="text-xs text-slate-500">{lifeSpan(p)}</div>
                    </div>
                  </li>
                ))}
                {preview.persons.length > 12 && <li className="px-3 py-2 text-xs text-slate-500">{t(`… ve ${preview.persons.length - 12} kişi daha`, `… and ${preview.persons.length - 12} more`)}</li>}
              </ul>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}
