import { useEffect, useState } from 'react'
import { BatchPanel } from '../components/BatchPanel'
import { DropZone } from '../components/DropZone'
import { MarkdownPreview } from '../components/MarkdownPreview'
import { Toast } from '../components/Toast'
import { useBatchConvert, type BatchItem } from '../hooks/useBatchConvert'
import { useInspect } from '../hooks/useInspect'
import { useTranslation } from '../i18n'
import { convertPdfToMd, type PdfToMdResponse } from '../lib/api'
import { DiagnosticPanel } from '../components/DiagnosticPanel'

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function PdfToMd() {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'warn'; message: string } | null>(null)

  const batch = useBatchConvert<PdfToMdResponse>({
    convert: (file, signal) => convertPdfToMd(file, {}, signal),
  })
  const inspect = useInspect()

  // Auto-select the most recently finished item so the preview follows the run.
  useEffect(() => {
    if (selectedId && batch.items.some((it) => it.id === selectedId)) return
    const lastDone = [...batch.items].reverse().find((it) => it.status === 'done')
    if (lastDone) setSelectedId(lastDone.id)
  }, [batch.items, selectedId])

  // Run inspect on the first file so the diagnostic panel still has something
  // to show (helps the user judge if OCR is needed before kicking off the run).
  const firstName = batch.items[0]?.file.name
  useEffect(() => {
    const first = batch.items[0]?.file
    if (first) void inspect.run(first)
    else inspect.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName])

  const selected = batch.items.find((it) => it.id === selectedId) ?? null

  const handleFiles = (files: File[]) => batch.add(files)

  const onConvertAll = async () => {
    await batch.runAll()
    setToast({ kind: 'ok', message: t.pdfToMd.success })
  }

  const onDownload = (item: BatchItem<PdfToMdResponse>) => {
    if (!item.result) return
    const out = item.file.name.replace(/\.pdf$/i, '.md')
    downloadText(out, item.result.md)
  }

  return (
    <div className="page container">
      <header className="page__head">
        <h1>{t.pdfToMd.title}</h1>
        <p>{t.pdfToMd.subtitle}</p>
      </header>

      <div className="grid-2">
        <div className="stack">
          <DropZone
            accept=".pdf,application/pdf"
            acceptLabel="PDF"
            onFiles={handleFiles}
            multiple
            disabled={batch.running}
          />
          <DiagnosticPanel
            data={inspect.data}
            loading={inspect.status === 'loading'}
            error={inspect.status === 'error' ? inspect.error?.message : null}
          />
          <BatchPanel
            items={batch.items}
            running={batch.running}
            onConvertAll={onConvertAll}
            onClear={batch.clear}
            onRemove={batch.remove}
            onDownload={onDownload}
            onSelect={(it) => setSelectedId(it.id)}
            selectedId={selectedId}
            downloadLabel={t.pdfToMd.download}
          />
        </div>

        <div>
          <MarkdownPreview
            markdown={selected?.result?.md ?? ''}
            empty={t.pdfToMd.previewEmpty}
          />
          {selected?.result?.warnings.length ? (
            <ul className="warnings" aria-label={t.pdfToMd.warnings}>
              {selected.result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      {toast && <Toast {...toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
