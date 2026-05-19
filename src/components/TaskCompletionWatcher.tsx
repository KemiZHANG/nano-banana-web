'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import {
  clearTaskNavigationWatch,
  readTaskNavigationWatch,
  type TaskNavigationWatch,
} from '@/lib/task-navigation'

type TaskRow = {
  type: 'product_copy' | 'standalone_image_job'
  id: string
}

function hasWatchedTask(tasks: TaskRow[], watch: TaskNavigationWatch) {
  if (watch.taskIds.length > 0) {
    return tasks.some((task) => task.type === watch.kind && watch.taskIds.includes(task.id))
  }
  return tasks.some((task) => task.type === watch.kind)
}

export default function TaskCompletionWatcher() {
  const router = useRouter()
  const pathname = usePathname()
  const [notice, setNotice] = useState<TaskNavigationWatch | null>(null)

  const checkTaskCompletion = useCallback(async () => {
    const watch = readTaskNavigationWatch()
    if (!watch) return

    const res = await apiFetch('/api/tasks')
    const data = await res.json().catch(() => null)
    if (!res.ok) return

    const tasks = Array.isArray(data?.tasks) ? (data.tasks as TaskRow[]) : []
    const stillRunning = hasWatchedTask(tasks, watch)
    const waitedLongEnough = Date.now() - watch.startedAt > 2500

    if (stillRunning || !waitedLongEnough) return

    clearTaskNavigationWatch()
    if (pathname === '/tasks') {
      router.replace(watch.resultPath)
      return
    }
    setNotice(watch)
  }, [pathname, router])

  useEffect(() => {
    void checkTaskCompletion()
    const timer = window.setInterval(() => void checkTaskCompletion(), 5000)
    return () => window.clearInterval(timer)
  }, [checkTaskCompletion])

  if (!notice) return null

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-2xl border border-emerald-200 bg-white p-4 text-sm shadow-2xl shadow-slate-950/15">
      <p className="font-semibold text-slate-950">生成任务已完成</p>
      <p className="mt-1 leading-6 text-slate-600">你当前正在其他页面操作，所以没有自动跳转。可以稍后继续，或现在查看{notice.resultLabel}。</p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setNotice(null)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          稍后查看
        </button>
        <button
          type="button"
          onClick={() => {
            setNotice(null)
            router.push(notice.resultPath)
          }}
          className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          查看结果
        </button>
      </div>
    </div>
  )
}
