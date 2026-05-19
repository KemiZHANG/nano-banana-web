'use client'

import { useCallback, useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { clearTaskNavigationWatch } from '@/lib/task-navigation'

type TaskRow = {
  type: 'product_copy' | 'standalone_image_job'
  id: string
  sku: string | null
  title: string | null
  label: string
  status: string
  created_at: string
  updated_at: string
  counts: Record<string, number>
}

function statusLabel(status: string) {
  if (status === 'queued' || status === 'pending') return '排队中'
  if (status === 'generating' || status === 'running') return '生成中'
  return status
}

function formatCounts(counts: Record<string, number>) {
  const queued = counts.queued || counts.pending || 0
  const running = counts.generating || counts.running || 0
  const completed = counts.completed || counts.needs_review || 0
  const failed = counts.failed || 0
  return { queued, running, completed, failed }
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    setError(null)
    const res = await apiFetch('/api/tasks')
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '任务加载失败')
      setLoading(false)
      return
    }
    setTasks(Array.isArray(data?.tasks) ? data.tasks : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void fetchTasks()
    const timer = window.setInterval(() => void fetchTasks(), 8000)
    return () => window.clearInterval(timer)
  }, [fetchTasks])

  const cancelTask = async (task: TaskRow) => {
    if (!window.confirm('确定停止这个任务吗？已成功生成的结果会保留，后续排队或生成中的内容会停止。')) return

    setBusyId(task.id)
    setError(null)
    const res = task.type === 'standalone_image_job'
      ? await apiFetch(`/api/jobs/${task.id}`, { method: 'DELETE' })
      : await apiFetch('/api/tasks/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: task.type, id: task.id }),
        })
    const data = await res.json().catch(() => null)
    setBusyId(null)
    if (!res.ok) {
      setError(data?.error || '取消任务失败')
      return
    }
    clearTaskNavigationWatch()
    await fetchTasks()
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(250,204,21,0.14),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(37,99,235,0.12),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_46%,#eef2f7_100%)]">
      <Navbar />
      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        <section className="mb-6 rounded-[1.75rem] bg-slate-950 p-6 text-white shadow-[0_22px_80px_rgba(15,23,42,0.16)]">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-200">TASK CENTER</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">任务中心</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
            集中查看正在排队或生成中的商品副本图片任务、单独图片任务。需要中止时可以在这里停止，避免继续产出错误内容。
          </p>
        </section>

        {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 shadow-sm">{error}</div>}

        <div className="mb-4 flex justify-end">
          <button onClick={fetchTasks} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 hover:bg-slate-800">
            刷新任务
          </button>
        </div>

        {loading ? (
          <div className="rounded-[1.4rem] border border-slate-200 bg-white/90 p-12 text-center text-sm text-slate-500">正在加载任务...</div>
        ) : tasks.length === 0 ? (
          <div className="rounded-[1.4rem] border border-slate-200 bg-white/90 p-12 text-center text-sm text-slate-500">暂无正在进行的任务。</div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const counts = formatCounts(task.counts)
              return (
                <article key={`${task.type}-${task.id}`} className="rounded-[1.4rem] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                          {task.type === 'product_copy' ? '商品副本任务' : '单独图片任务'}
                        </span>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{statusLabel(task.status)}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{task.label}</span>
                      </div>
                      <h2 className="mt-3 truncate text-xl font-semibold text-slate-950">
                        {task.sku ? `${task.sku} - ${task.title || '未命名商品'}` : task.title}
                      </h2>
                      <p className="mt-2 text-xs text-slate-500">更新时间：{new Date(task.updated_at || task.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">排队 {counts.queued}</span>
                      <span className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">生成中 {counts.running}</span>
                      <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">已完成 {counts.completed}</span>
                      <span className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">失败 {counts.failed}</span>
                      <button
                        type="button"
                        onClick={() => cancelTask(task)}
                        disabled={busyId === task.id}
                        className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {busyId === task.id ? '停止中...' : '停止任务'}
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
