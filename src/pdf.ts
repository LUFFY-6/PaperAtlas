const assets = import.meta.glob(
  ['/node_modules/pdfjs-dist/cmaps/*.bcmap', '/node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}', '/node_modules/pdfjs-dist/wasm/*.wasm'],
  { eager: true, import: 'default', query: '?url&no-inline' },
) as Record<string, string>

const folders = { cMapUrl: 'cmaps', standardFontDataUrl: 'standard_fonts', wasmUrl: 'wasm' } as const

class PdfAssets {
  async fetch({ kind, filename }: { kind: keyof typeof folders; filename: string }) {
    const url = assets[`/node_modules/pdfjs-dist/${folders[kind]}/${filename}`]
    if (!url) throw new Error('PDF resource unavailable')
    const response = await fetch(url)
    if (!response.ok) throw new Error('PDF resource unavailable')
    return new Uint8Array(await response.arrayBuffer())
  }
}

export async function openPdf(original: Blob) {
  const [pdfjs, { default: worker }, data] = await Promise.all([
    import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url'), original.arrayBuffer(),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  return pdfjs.getDocument({ data, BinaryDataFactory: PdfAssets, useWorkerFetch: false })
}
