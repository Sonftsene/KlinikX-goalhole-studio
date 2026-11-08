import { useCallback, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { RotateCw, ZoomIn } from 'lucide-react'
import { Button, Sheet } from '../ui'
import { cropAndCompress } from '../../lib/image'
import { useT } from '../../lib/i18n'

/** Square/round crop dialog. Calls onDone with a compressed JPEG. */
export function PhotoCropper({
  src,
  onClose,
  onDone,
  round = true,
  aspect = 1,
  maxSize = 800,
  title,
}: {
  src: string | null
  onClose: () => void
  onDone: (blob: Blob) => Promise<void> | void
  round?: boolean
  aspect?: number
  maxSize?: number
  title?: string
}) {
  const t = useT()
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [area, setArea] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)
  const onComplete = useCallback((_: Area, px: Area) => setArea(px), [])

  return (
    <Sheet
      open={!!src}
      onClose={onClose}
      title={title ?? t('Fotoğrafı düzenle', 'Edit photo')}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t('Vazgeç', 'Cancel')}
          </Button>
          <Button
            className="flex-1"
            loading={busy}
            onClick={async () => {
              if (!src) return
              setBusy(true)
              try {
                const blob = await cropAndCompress(src, area, maxSize, 0.85, rotation)
                await onDone(blob)
              } finally {
                setBusy(false)
              }
            }}
          >
            {t('Kaydet', 'Save')}
          </Button>
        </>
      }
    >
      {src && (
        <>
          <div className="relative h-[55dvh] max-h-[420px] w-full overflow-hidden rounded-2xl bg-slate-900">
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              cropShape={round ? 'round' : 'rect'}
              showGrid={!round}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onComplete}
            />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <ZoomIn size={18} className="text-slate-500" />
            <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-brand-700" />
            <Button variant="secondary" size="icon" onClick={() => setRotation((r) => (r + 90) % 360)} aria-label={t('Döndür', 'Rotate')}>
              <RotateCw size={18} />
            </Button>
          </div>
        </>
      )}
    </Sheet>
  )
}
