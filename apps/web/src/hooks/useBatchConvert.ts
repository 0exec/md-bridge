import { useCallback, useEffect, useRef, useState } from 'react'

export type BatchStatus = 'queued' | 'converting' | 'done' | 'error'

export interface BatchItem<TResult> {
  id: string
  file: File
  status: BatchStatus
  result: TResult | null
  error: { code: string; message: string } | null
  /** Object URL for results that exposed as a blob (used by the MD to PDF flow). */
  blobUrl: string | null
}

interface UseBatchConvertOptions<TResult> {
  convert: (file: File, signal: AbortSignal) => Promise<TResult>
  /** Optionally turn the result into an object URL the UI can preview or download. */
  toBlobUrl?: (result: TResult) => string | null
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function useBatchConvert<TResult>({ convert, toBlobUrl }: UseBatchConvertOptions<TResult>) {
  const [items, setItems] = useState<BatchItem<TResult>[]>([])
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const blobUrlsRef = useRef<string[]>([])

  useEffect(() => {
    return () => {
      for (const url of blobUrlsRef.current) URL.revokeObjectURL(url)
    }
  }, [])

  const patch = useCallback((id: string, patch: Partial<BatchItem<TResult>>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }, [])

  const add = useCallback((files: File[]) => {
    if (files.length === 0) return
    setItems((prev) => [
      ...prev,
      ...files.map<BatchItem<TResult>>((file) => ({
        id: makeId(),
        file,
        status: 'queued',
        result: null,
        error: null,
        blobUrl: null,
      })),
    ])
  }, [])

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id)
      if (target?.blobUrl) {
        URL.revokeObjectURL(target.blobUrl)
        blobUrlsRef.current = blobUrlsRef.current.filter((u) => u !== target.blobUrl)
      }
      return prev.filter((it) => it.id !== id)
    })
  }, [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    for (const url of blobUrlsRef.current) URL.revokeObjectURL(url)
    blobUrlsRef.current = []
    setItems([])
    setRunning(false)
  }, [])

  // Snapshot the current queue and process each `queued` item in order. New
  // items added while the run is in flight stay queued until the next call.
  const runAll = useCallback(async () => {
    if (running) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setRunning(true)

    // Capture the IDs to process so we don't re-run items the user might add
    // mid-flight (they remain queued, ready for the next click).
    let snapshot: BatchItem<TResult>[] = []
    setItems((prev) => {
      snapshot = prev
      return prev
    })
    // Wait for the snapshot assignment to flush.
    await Promise.resolve()
    const targets = snapshot.filter((it) => it.status === 'queued').map((it) => it.id)

    for (const id of targets) {
      if (ctrl.signal.aborted) break
      patch(id, { status: 'converting' })
      const file = snapshot.find((it) => it.id === id)?.file
      if (!file) continue
      try {
        const result = await convert(file, ctrl.signal)
        if (ctrl.signal.aborted) break
        const blobUrl = toBlobUrl ? toBlobUrl(result) : null
        if (blobUrl) blobUrlsRef.current.push(blobUrl)
        patch(id, { status: 'done', result, blobUrl, error: null })
      } catch (err) {
        if (ctrl.signal.aborted) break
        const message =
          err && typeof err === 'object' && 'message' in err
            ? String((err as Error).message)
            : 'Unknown error'
        const code =
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code: unknown }).code)
            : 'unknown'
        patch(id, { status: 'error', error: { code, message } })
      }
    }

    setRunning(false)
  }, [convert, patch, running, toBlobUrl])

  return { items, running, add, remove, clear, runAll }
}
