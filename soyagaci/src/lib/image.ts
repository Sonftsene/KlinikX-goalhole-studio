/** Image helpers: everything is resized and compressed in the browser before upload. */

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Görsel yüklenemedi'))
    img.src = src
  })
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Görsel sıkıştırılamadı'))), 'image/jpeg', quality),
  )
}

export interface CropArea {
  x: number
  y: number
  width: number
  height: number
}

/** Crops `src` to `area` (in source pixels) and scales the result to fit `maxSize`. */
export async function cropAndCompress(src: string, area: CropArea | null, maxSize = 800, quality = 0.85, rotation = 0): Promise<Blob> {
  const img = await loadImage(src)
  // First draw the (optionally rotated) full image.
  const rad = (rotation * Math.PI) / 180
  const sin = Math.abs(Math.sin(rad))
  const cos = Math.abs(Math.cos(rad))
  const rw = img.width * cos + img.height * sin
  const rh = img.width * sin + img.height * cos
  const full = document.createElement('canvas')
  full.width = rw
  full.height = rh
  const fctx = full.getContext('2d')!
  fctx.translate(rw / 2, rh / 2)
  fctx.rotate(rad)
  fctx.drawImage(img, -img.width / 2, -img.height / 2)

  const a = area ?? { x: 0, y: 0, width: rw, height: rh }
  const scale = Math.min(1, maxSize / Math.max(a.width, a.height))
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(a.width * scale))
  out.height = Math.max(1, Math.round(a.height * scale))
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(full, a.x, a.y, a.width, a.height, 0, 0, out.width, out.height)
  return canvasToBlob(out, quality)
}

/** Resize without cropping (album photos). */
export async function compressImage(file: Blob, maxSize = 1600, quality = 0.82): Promise<Blob> {
  const url = await fileToDataUrl(file)
  return cropAndCompress(url, null, maxSize, quality)
}
