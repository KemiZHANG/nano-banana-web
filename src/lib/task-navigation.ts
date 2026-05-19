'use client'

export type TaskNavigationKind = 'product_copy' | 'standalone_image_job'

export type TaskNavigationWatch = {
  id: string
  kind: TaskNavigationKind
  taskIds: string[]
  resultPath: string
  resultLabel: string
  startedAt: number
}

const TASK_NAVIGATION_KEY = 'dlm-ai-task-navigation-watch'

export function startTaskNavigationWatch(input: Omit<TaskNavigationWatch, 'id' | 'startedAt'>) {
  if (typeof window === 'undefined') return
  const watch: TaskNavigationWatch = {
    ...input,
    id: `${input.kind}-${Date.now()}`,
    startedAt: Date.now(),
  }
  window.localStorage.setItem(TASK_NAVIGATION_KEY, JSON.stringify(watch))
}

export function readTaskNavigationWatch(): TaskNavigationWatch | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(TASK_NAVIGATION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TaskNavigationWatch>
    if (!parsed.kind || !parsed.resultPath || !parsed.startedAt) return null
    return {
      id: parsed.id || `${parsed.kind}-${parsed.startedAt}`,
      kind: parsed.kind,
      taskIds: Array.isArray(parsed.taskIds) ? parsed.taskIds.filter(Boolean) : [],
      resultPath: parsed.resultPath,
      resultLabel: parsed.resultLabel || '结果页',
      startedAt: Number(parsed.startedAt),
    }
  } catch {
    return null
  }
}

export function clearTaskNavigationWatch() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(TASK_NAVIGATION_KEY)
}
