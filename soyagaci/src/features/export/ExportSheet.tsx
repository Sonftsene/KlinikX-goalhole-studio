import { useMemo, useState } from 'react'
import { Download, FileImage, FileText, Printer, Share2 } from 'lucide-react'
import type { Person } from '../../types'
import type { TreeLayout } from '../tree/layout'
import { Button, Segmented, Sheet, Switch, toast } from '../../components/ui'
import { useLang, useT } from '../../lib/i18n'
import type { ExportInput } from './exportTree'
import { type Orientation, type Paper, tilePlan } from './plan'

type Format = 'png' | 'pdf' | 'svg' | 'print'

export interface ExportSheetProps {
  open: boolean
  onClose: () => void
  layout: TreeLayout
  /** Same chart with every branch expanded (optional). */
  fullLayout?: () => TreeLayout
  persons: Map<string, Person>
  meId?: string
  title: string
  subtitle?: string
  blood?: Set<string>
}

const CARD_SIZES = [
  { value: 'small', mm: 28 },
  { value: 'medium', mm: 38 },
  { value: 'large', mm: 52 },
] as const

export function ExportSheet(props: ExportSheetProps) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [format, setFormat] = useState<Format>('pdf')
  const [paper, setPaper] = useState<Paper>('A4')
  const [orientation, setOrientation] = useState<Orientation>('landscape')
  const [pdfMode, setPdfMode] = useState<'fit' | 'tiles'>('fit')
  const [cardSize, setCardSize] = useState<(typeof CARD_SIZES)[number]['value']>('medium')
  const [withTitle, setWithTitle] = useState(true)
  const [withLegend, setWithLegend] = useState(true)
  const [withBlood, setWithBlood] = useState(false)
  const [expandAll, setExpandAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string>('')
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null)

  const layout = useMemo(() => (expandAll && props.fullLayout ? props.fullLayout() : props.layout), [expandAll, props])
  const cardMm = CARD_SIZES.find((c) => c.value === cardSize)!.mm
  const plan = useMemo(() => tilePlan(layout, { paper, orientation, cardMm }), [layout, paper, orientation, cardMm])

  const input = (): ExportInput => ({
    layout,
    persons: props.persons,
    meId: props.meId,
    title: withTitle ? props.title : undefined,
    subtitle: withTitle ? props.subtitle : undefined,
    legend: withLegend,
    lang,
    blood: withBlood ? props.blood : undefined,
  })

  const run = async () => {
    setBusy(true)
    setResult(null)
    setProgress('')
    try {
      const { downloadBlob, exportTreePdf, exportTreePng, exportTreeSvg, printTree, safeFileName } = await import('./exportTree')
      const baseName = safeFileName(`${props.title}-soyagaci`)
      if (format === 'print') {
        await printTree(input(), orientation)
        return
      }
      let blob: Blob
      let name: string
      if (format === 'png') {
        blob = await exportTreePng(input(), 2.5)
        name = `${baseName}.png`
      } else if (format === 'svg') {
        blob = await exportTreeSvg(input())
        name = `${baseName}.svg`
      } else {
        blob = await exportTreePdf(input(), {
          paper,
          orientation,
          layoutMode: pdfMode,
          cardMm,
          onProgress: (d, n) => setProgress(`${Math.min(d + 1, n)}/${n}`),
        })
        name = `${baseName}-${paper.toLowerCase()}.pdf`
      }
      setResult({ blob, name })
      downloadBlob(blob, name)
      toast.success(t('Dosya hazır', 'File ready'))
    } catch (e) {
      toast.error((e as Error).message || t('Dışa aktarma başarısız', 'Export failed'))
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={t('Ağacı dışa aktar', 'Export tree')}
      footer={
        <>
          {result && canShare && (
            <Button
              variant="outline"
              icon={<Share2 size={18} />}
              onClick={async () => {
                const { downloadBlob, shareBlob } = await import('./exportTree')
                const ok = await shareBlob(result.blob, result.name, props.title)
                if (!ok) downloadBlob(result.blob, result.name)
              }}
            >
              {t('Paylaş', 'Share')}
            </Button>
          )}
          <Button className="flex-1" size="lg" loading={busy} onClick={run} icon={format === 'print' ? <Printer size={18} /> : <Download size={18} />}>
            {busy && progress
              ? t(`Sayfa ${progress} hazırlanıyor…`, `Rendering page ${progress}…`)
              : format === 'print'
                ? t('Yazdır', 'Print')
                : t('Oluştur ve indir', 'Create & download')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="section-title">{t('Biçim', 'Format')}</p>
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                { v: 'pdf', icon: FileText, label: 'PDF' },
                { v: 'png', icon: FileImage, label: t('Görsel', 'Image') },
                { v: 'svg', icon: FileImage, label: 'SVG' },
                { v: 'print', icon: Printer, label: t('Yazdır', 'Print') },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                onClick={() => setFormat(o.v)}
                className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-sm font-medium transition ${
                  format === o.v ? 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200' : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <o.icon size={22} />
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {format === 'png' && t('Yüksek çözünürlüklü PNG — paylaşmak ve büyük baskı için.', 'High-resolution PNG — for sharing and large prints.')}
            {format === 'svg' && t('Sonsuz büyütülebilir vektör dosya — matbaa ve poster için ideal.', 'Infinitely scalable vector — ideal for printing shops.')}
            {format === 'pdf' && t('A4 veya A3 kâğıda hazır PDF; tek sayfa ya da çok sayfalı poster.', 'Print-ready PDF on A4/A3: one page or multi-page poster.')}
            {format === 'print' && t('Doğrudan yazıcıya gönderir.', 'Sends straight to your printer.')}
          </p>
        </div>

        {(format === 'pdf' || format === 'print') && (
          <div className="space-y-3">
            {format === 'pdf' && (
              <div>
                <p className="section-title">{t('Kâğıt', 'Paper')}</p>
                <Segmented value={paper} onChange={setPaper} options={[{ value: 'A4', label: 'A4' }, { value: 'A3', label: 'A3' }]} />
              </div>
            )}
            <div>
              <p className="section-title">{t('Yön', 'Orientation')}</p>
              <Segmented
                value={orientation}
                onChange={setOrientation}
                options={[
                  { value: 'landscape', label: t('Yatay', 'Landscape') },
                  { value: 'portrait', label: t('Dikey', 'Portrait') },
                ]}
              />
            </div>
            {format === 'pdf' && (
              <div>
                <p className="section-title">{t('Sayfa düzeni', 'Page layout')}</p>
                <Segmented
                  value={pdfMode}
                  onChange={setPdfMode}
                  options={[
                    { value: 'fit', label: t('Tek sayfaya sığdır', 'Fit to one page') },
                    { value: 'tiles', label: t('Poster (çok sayfa)', 'Poster (multi-page)') },
                  ]}
                />
                {pdfMode === 'tiles' && (
                  <div className="mt-3 space-y-2 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
                    <p className="text-sm font-medium">{t('Kart boyutu', 'Card size')}</p>
                    <Segmented
                      value={cardSize}
                      onChange={setCardSize}
                      options={[
                        { value: 'small', label: t('Küçük', 'Small') },
                        { value: 'medium', label: t('Orta', 'Medium') },
                        { value: 'large', label: t('Büyük', 'Large') },
                      ]}
                    />
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {t(
                        `${plan.cols * plan.rows} sayfa (${plan.cols} sütun × ${plan.rows} satır). Sayfalar kesim işaretleri ve yapıştırma çizgileriyle basılır; yan yana birleştirince tek parça poster olur.`,
                        `${plan.cols * plan.rows} pages (${plan.cols} × ${plan.rows}). Pages include crop marks and glue lines so they join into one poster.`,
                      )}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <Switch checked={withTitle} onChange={setWithTitle} label={t('Başlık ve tarih ekle', 'Add title and date')} />
          <Switch checked={withLegend} onChange={setWithLegend} label={t('Renk açıklaması ekle', 'Add colour legend')} />
          {props.blood && props.blood.size > 0 && (
            <Switch checked={withBlood} onChange={setWithBlood} label={t('Kan bağı vurgusunu göster', 'Show blood-line highlight')} />
          )}
          {props.fullLayout && <Switch checked={expandAll} onChange={setExpandAll} label={t('Tüm dalları açarak aktar', 'Export with all branches expanded')} />}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t(`${new Set(layout.nodes.map((n) => n.personId)).size} kişi aktarılacak. Baskıda her zaman açık renk tema kullanılır.`, `${new Set(layout.nodes.map((n) => n.personId)).size} people will be exported. Prints always use the light theme.`)}
        </p>
      </div>
    </Sheet>
  )
}
