import { useEffect, useState } from 'react'

export type DeviceTier = 'mobile' | 'desktop'

const STORAGE_KEY = 'gi.deviceTier.override'
const DESKTOP_BREAKPOINT_PX = 1024

function readOverride(): DeviceTier | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'mobile' || stored === 'desktop' ? stored : null
}

function detectFromViewport(): DeviceTier {
  if (typeof window === 'undefined') return 'desktop'
  const wide = window.innerWidth >= DESKTOP_BREAKPOINT_PX
  const finePointer = window.matchMedia('(pointer: fine)').matches
  return wide && finePointer ? 'desktop' : 'mobile'
}

export function useDeviceTier(): {
  tier: DeviceTier
  override: DeviceTier | null
  setOverride: (tier: DeviceTier | null) => void
} {
  const [override, setOverrideState] = useState<DeviceTier | null>(() => readOverride())
  const [detected, setDetected] = useState<DeviceTier>(() => detectFromViewport())

  useEffect(() => {
    const onResize = () => setDetected(detectFromViewport())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const setOverride = (tier: DeviceTier | null) => {
    if (tier === null) {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, tier)
    }
    setOverrideState(tier)
  }

  return {
    tier: override ?? detected,
    override,
    setOverride,
  }
}
