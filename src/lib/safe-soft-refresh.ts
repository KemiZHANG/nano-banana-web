'use client'

import { useEffect } from 'react'

const DEFAULT_SOFT_REFRESH_INTERVAL_MS = 30000

function isEditableElement(element: Element | null) {
  if (!element) return false
  const tagName = element.tagName.toLowerCase()
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    element.getAttribute('contenteditable') === 'true'
  )
}

export function isSoftRefreshBlocked() {
  if (typeof document === 'undefined') return true
  if (document.visibilityState !== 'visible') return true
  if (isEditableElement(document.activeElement)) return true
  if (window.getSelection()?.toString()) return true
  if (document.querySelector('[data-soft-refresh-block="true"]')) return true
  return false
}

export function runSafeSoftRefresh(refresh: () => void | Promise<void>) {
  if (isSoftRefreshBlocked()) return
  void refresh()
}

export function useSafeAutoRefresh(
  refresh: () => void | Promise<void>,
  options: { enabled?: boolean; intervalMs?: number } = {}
) {
  const enabled = options.enabled ?? true
  const intervalMs = options.intervalMs ?? DEFAULT_SOFT_REFRESH_INTERVAL_MS

  useEffect(() => {
    if (!enabled) return

    const handleWindowFocus = () => runSafeSoftRefresh(refresh)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runSafeSoftRefresh(refresh)
      }
    }

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    const intervalId = window.setInterval(() => runSafeSoftRefresh(refresh), intervalMs)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, intervalMs, refresh])
}
