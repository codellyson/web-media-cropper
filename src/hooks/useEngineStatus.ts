import { useEffect, useState } from 'react'
import { getEngineStatus, subscribeEngine, type EngineStatus } from '@/lib/ffmpegEngine'

export function useEngineStatus(): EngineStatus {
  const [status, setStatus] = useState<EngineStatus>(getEngineStatus())
  useEffect(() => subscribeEngine(setStatus), [])
  return status
}
