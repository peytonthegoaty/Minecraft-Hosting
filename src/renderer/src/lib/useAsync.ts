import { useCallback, useEffect, useState } from 'react'
import { errorText } from '../api'

/** Loads data with loading/error state; `reload` refetches. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; loading: boolean; error: string | null; reload: () => Promise<void>; setData: (d: T) => void } {
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)
  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await run())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [run])
  useEffect(() => {
    void reload()
  }, [reload])
  return { data, loading, error, reload, setData }
}
