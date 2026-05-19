'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { subscribeToTableChanges } from '@/lib/client-realtime'
import { runSafeSoftRefresh, useSafeAutoRefresh } from '@/lib/safe-soft-refresh'
import PaginationBar from '@/components/PaginationBar'
import { supabase } from '@/lib/supabase'
import { sanitizeListingText } from '@/lib/listing-text'
import { pickText, useUiLanguage, type UiLanguage } from '@/lib/ui-language'
import { PRODUCT_LANGUAGES, type ListingStatus } from '@/lib/types'
import type { Category, ProductCopy, ProductCopyImage } from '@/lib/types'
import {
  SHOPEE_CATEGORY_ATTRIBUTE_KEY,
  decodeShopeeCategorySelection,
  formatShopeeCategorySelection,
} from '@/lib/shopee-categories'

type WorkbenchFilter = 'all' | ListingStatus | 'image_failed'

const AUTO_REFRESH_INTERVAL_MS = 45 * 1000
const COPIES_PER_PAGE = 12

const LISTING_STATUS_OPTIONS: Array<{ value: ListingStatus; zh: string; en: string; tone: string }> = [
  { value: 'not_listed', zh: '未上品', en: 'Not listed', tone: 'bg-slate-100 text-slate-700' },
  { value: 'listed', zh: '已上品', en: 'Listed', tone: 'bg-emerald-50 text-emerald-700' },
  { value: 'needs_edit', zh: '需修改', en: 'Needs edit', tone: 'bg-amber-50 text-amber-700' },
  { value: 'paused', zh: '暂停', en: 'Paused', tone: 'bg-zinc-100 text-zinc-700' },
  { value: 'done', zh: '已完成', en: 'Done', tone: 'bg-blue-50 text-blue-700' },
]

const FILTERS: Array<{ value: WorkbenchFilter; zh: string; en: string }> = [
  { value: 'all', zh: '全部', en: 'All' },
  { value: 'not_listed', zh: '未上品', en: 'Not listed' },
  { value: 'listed', zh: '已上品', en: 'Listed' },
  { value: 'needs_edit', zh: '需修改', en: 'Needs edit' },
  { value: 'image_failed', zh: '图片失败', en: 'Image failed' },
]

function statusMeta(status: string | null | undefined, language: UiLanguage) {
  const item = LISTING_STATUS_OPTIONS.find((option) => option.value === status) || LISTING_STATUS_OPTIONS[0]
  return {
    value: item.value,
    label: pickText(language, { zh: item.zh, en: item.en }),
    tone: item.tone,
  }
}

function copyStatusMeta(status: ProductCopy['status'] | null | undefined, language: UiLanguage) {
  const options: Record<ProductCopy['status'], { zh: string; en: string; tone: string }> = {
    queued: { zh: '排队中', en: 'Queued', tone: 'bg-blue-50 text-blue-700' },
    generating: { zh: '生成中', en: 'Generating', tone: 'bg-sky-50 text-sky-700' },
    completed: { zh: '已完成', en: 'Completed', tone: 'bg-emerald-50 text-emerald-700' },
    failed: { zh: '生成失败', en: 'Failed', tone: 'bg-red-50 text-red-700' },
    needs_review: { zh: '需检查', en: 'Needs review', tone: 'bg-amber-50 text-amber-700' },
  }
  const item = options[status || 'queued']
  return {
    label: pickText(language, { zh: item.zh, en: item.en }),
    tone: item.tone,
  }
}

function imageDoneCount(images: ProductCopyImage[]) {
  return images.filter((image) => image.status === 'completed' || Boolean(image.pending_storage_path)).length
}

export default function ProductOutputsPage() {
  const router = useRouter()
  const { language: uiLanguage } = useUiLanguage()
  const [loading, setLoading] = useState(true)
  const [copies, setCopies] = useState<ProductCopy[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [sku, setSku] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [language, setLanguage] = useState('')
  const [date, setDate] = useState('')
  const [shopeeFilter, setShopeeFilter] = useState('')
  const [filter, setFilter] = useState<WorkbenchFilter>('all')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkStoreName, setBulkStoreName] = useState('')
  const [copyPage, setCopyPage] = useState(1)
  const [copyTotal, setCopyTotal] = useState(0)
  const [copyTotalPages, setCopyTotalPages] = useState(1)
  const [failedImageCopyIds, setFailedImageCopyIds] = useState<string[]>([])
  const text = {
    loading: pickText(uiLanguage, { zh: '加载中...', en: 'Loading...' }),
    retrying: pickText(uiLanguage, { zh: '正在重试...', en: 'Retrying...' }),
    heroEyebrow: pickText(uiLanguage, { zh: '副本输出工作台', en: 'Generated listings workbench' }),
    heroTitle: pickText(uiLanguage, { zh: '商品副本输出工作台', en: 'Product outputs' }),
    heroDescription: pickText(uiLanguage, {
      zh: '这里直接管理副本、图片、Shopee 类目和上品进度。单张图片重生会先生成待确认新图，员工确认后才替换旧图。',
      en: 'Manage generated copies, images, Shopee categories, and listing progress in one place. Single-image regeneration creates a review candidate before replacing the current image.',
    }),
    retryFailedImages: (count: number) => pickText(uiLanguage, {
      zh: `批量重试失败图片 (${count})`,
      en: `Retry failed images (${count})`,
    }),
    skuPlaceholder: pickText(uiLanguage, { zh: '请输入 SKU', en: 'Search SKU' }),
    category: pickText(uiLanguage, { zh: '类目', en: 'Category' }),
    allCategories: pickText(uiLanguage, { zh: '全部类目', en: 'All categories' }),
    language: pickText(uiLanguage, { zh: '语言', en: 'Language' }),
    allLanguages: pickText(uiLanguage, { zh: '全部语言', en: 'All languages' }),
    createdDate: pickText(uiLanguage, { zh: '生成日期', en: 'Created date' }),
    shopeeCategory: pickText(uiLanguage, { zh: 'Shopee 类目', en: 'Shopee category' }),
    shopeePlaceholder: pickText(uiLanguage, { zh: '输入类目路径或叶类目', en: 'Path or leaf category' }),
    filter: pickText(uiLanguage, { zh: '筛选', en: 'Filter' }),
    batchActions: pickText(uiLanguage, { zh: '批量操作', en: 'Batch actions' }),
    batchSummary: (selectedCount: number, visibleCount: number) => pickText(uiLanguage, {
      zh: `已选择 ${selectedCount} 个副本；当前筛选显示 ${visibleCount} 个。可以批量标记上品、设置店铺、重试失败图片或导出给员工上架。`,
      en: `${selectedCount} selected · ${visibleCount} match the current filters. Batch actions can mark items as listed, set store names, retry failed images, or export rows.`,
    }),
    selectPage: pickText(uiLanguage, { zh: '选择当前页', en: 'Select page' }),
    clearSelection: pickText(uiLanguage, { zh: '清空选择', en: 'Clear selection' }),
    bulkStorePlaceholder: pickText(uiLanguage, { zh: '店铺名，例如：Shopee MY 店铺 A', en: 'Store name, for example: Shopee MY Store A' }),
    markListed: pickText(uiLanguage, { zh: '标记已上品', en: 'Mark listed' }),
    setStore: pickText(uiLanguage, { zh: '设置店铺', en: 'Set store' }),
    retryFailedBatch: pickText(uiLanguage, { zh: '批量重试失败图片', en: 'Retry failed images' }),
    exportSelected: pickText(uiLanguage, { zh: '导出所选', en: 'Export selected' }),
    exportFiltered: pickText(uiLanguage, { zh: '导出当前筛选', en: 'Export page' }),
    emptyTitle: pickText(uiLanguage, { zh: '暂无符合条件的商品副本', en: 'No copies match the current filters.' }),
    emptyDescription: pickText(uiLanguage, { zh: '可以调整筛选条件，或回到商品页生成新的副本。', en: 'Adjust the filters or generate new copies from the products page.' }),
    unlinkedCategory: pickText(uiLanguage, { zh: '未关联类目', en: 'No category linked' }),
    notTagged: pickText(uiLanguage, { zh: '未标注', en: 'Not tagged' }),
    imageCount: (done: number, total: number) => pickText(uiLanguage, {
      zh: `${done}/${total} 图`,
      en: `${done}/${total} images`,
    }),
    selectSku: (sku: string) => pickText(uiLanguage, { zh: `选择 ${sku}`, en: `Select ${sku}` }),
    pageSummary: (count: number, page: number, totalPages: number) => pickText(uiLanguage, {
      zh: `共 ${count} 个副本，当前第 ${page} / ${totalPages} 页`,
      en: `${count} copies total · page ${page} / ${totalPages}`,
    }),
    saving: pickText(uiLanguage, { zh: '保存中...', en: 'Saving...' }),
    operator: (email: string) => pickText(uiLanguage, { zh: `操作者：${email}`, en: `Operator: ${email}` }),
    unrecorded: pickText(uiLanguage, { zh: '未记录', en: 'Not recorded' }),
    openDetails: pickText(uiLanguage, { zh: '打开详情 →', en: 'Open details →' }),
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login')
      else setLoading(false)
    })
  }, [router])

  const fetchCategories = useCallback(async () => {
    const res = await apiFetch('/api/categories')
    if (res.ok) setCategories(await res.json())
  }, [])

  const fetchCopies = useCallback(async () => {
    setError(null)
    const params = new URLSearchParams()
    params.set('page', String(copyPage))
    params.set('limit', String(COPIES_PER_PAGE))
    if (sku) params.set('sku', sku)
    if (categoryId) params.set('category_id', categoryId)
    if (language) params.set('language', language)
    if (date) params.set('date', date)
    params.set('listing_filter', filter)
    if (shopeeFilter.trim()) params.set('shopee_search', shopeeFilter.trim())
    const res = await apiFetch(`/api/product-copies?${params.toString()}`)
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '输出结果加载失败')
      return
    }
    const rows = (Array.isArray(data?.data) ? data.data : []) as ProductCopy[]
    setCopies(rows)
    setCopyTotal(Number(data?.total || rows.length || 0))
    setCopyTotalPages(Math.max(1, Number(data?.totalPages || 1)))
    setFailedImageCopyIds(Array.isArray(data?.failedCopyIds) ? data.failedCopyIds : [])
    setSelectedIds((previous) => previous.filter((id) => rows.some((row) => row.id === id)))
  }, [categoryId, copyPage, date, filter, language, shopeeFilter, sku])

  const batchUpdateCopies = async (patch: Record<string, unknown>, key: string) => {
    if (selectedIds.length === 0) {
      setError('请先选择要批量处理的副本')
      return
    }
    setBusyKey(key)
    setError(null)
    setNotice(null)
    const res = await apiFetch('/api/product-copies/batch', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selectedIds, ...patch }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '批量操作失败')
    } else {
      setNotice(`已批量更新 ${data.updated || 0} 个副本。`)
      await fetchCopies()
    }
    setBusyKey(null)
  }

  const exportCopies = async (selectedOnly = false) => {
    setBusyKey(selectedOnly ? 'export-selected' : 'export-all')
    setError(null)
    const params = new URLSearchParams()
    if (selectedOnly) {
      if (selectedIds.length === 0) {
        setError('请先选择要导出的副本')
        setBusyKey(null)
        return
      }
      params.set('ids', selectedIds.join(','))
    } else {
      if (filter === 'image_failed' || shopeeFilter.trim()) {
        params.set('ids', visibleIds.join(','))
      } else {
        if (sku) params.set('sku', sku)
        if (categoryId) params.set('category_id', categoryId)
        if (language) params.set('language', language)
        if (date) params.set('date', date)
        if (filter !== 'all') params.set('listing_status', filter)
      }
    }

    const res = await apiFetch(`/api/product-copies/export?${params.toString()}`)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error || '导出失败')
      setBusyKey(null)
      return
    }

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `product-copies-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setBusyKey(null)
  }

  const retryImages = async (
    payload: { image_ids?: string[]; copy_ids?: string[]; failed_only?: boolean; regeneration_note?: string },
    key: string
  ) => {
    setBusyKey(key)
    setError(null)
    setNotice(null)
    const res = await apiFetch('/api/product-copy-images/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '图片重试失败')
    } else {
      setNotice(`已重新排队 ${data.queued || 0} 张图片。单张重生完成后会显示为“待确认新图”。`)
      await fetchCopies()
    }
    setBusyKey(null)
  }

  useEffect(() => {
    if (!loading) {
      fetchCategories()
      fetchCopies()
    }
  }, [loading, fetchCategories, fetchCopies])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const visibleIds = useMemo(() => copies.map((copy) => copy.id), [copies])
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id))

  useEffect(() => {
    setCopyPage(1)
  }, [categoryId, date, filter, language, shopeeFilter, sku])

  useEffect(() => {
    if (copyPage > copyTotalPages) {
      setCopyPage(copyTotalPages)
    }
  }, [copyPage, copyTotalPages])

  useSafeAutoRefresh(fetchCopies, { enabled: !loading, intervalMs: AUTO_REFRESH_INTERVAL_MS })

  useEffect(() => {
    if (loading) return

    return subscribeToTableChanges(
      'product-outputs-page-realtime',
      [
        { table: 'product_copies' },
        { table: 'product_copy_images' },
        { table: 'products' },
      ],
      () => {
        runSafeSoftRefresh(fetchCopies)
      },
      { debounceMs: 500 }
    )
  }, [fetchCopies, loading])

  const toggleCopySelection = (copyId: string) => {
    setSelectedIds((previous) => (
      previous.includes(copyId)
        ? previous.filter((id) => id !== copyId)
        : [...previous, copyId]
    ))
  }

  const toggleVisibleSelection = () => {
    setSelectedIds((previous) => {
      if (allVisibleSelected) return previous.filter((id) => !visibleIds.includes(id))
      return Array.from(new Set([...previous, ...visibleIds]))
    })
  }

  const deleteCopy = async (copy: ProductCopy) => {
    if (!window.confirm(pickText(uiLanguage, {
      zh: `确定删除 ${copy.sku} 的 ${copy.language_label}${copy.copy_index} 副本吗？`,
      en: `Delete copy ${copy.language_label}${copy.copy_index} for ${copy.sku}?`,
    }))) return

    setBusyKey(`delete-${copy.id}`)
    setError(null)
    setNotice(null)
    const res = await apiFetch(`/api/product-copies/${copy.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    setBusyKey(null)
    if (!res.ok) {
      setError(data?.error || pickText(uiLanguage, { zh: '删除副本失败', en: 'Failed to delete copy' }))
      return
    }
    setNotice(pickText(uiLanguage, { zh: '副本已删除。', en: 'Copy deleted.' }))
    await fetchCopies()
  }

  if (loading) {
    return <div className="app-shell flex min-h-screen items-center justify-center text-sm text-slate-500">{text.loading}</div>
  }

  return (
    <div className="app-shell min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-[1700px] px-4 py-6 sm:px-6">
        <div className="hero-panel mb-5 flex flex-col gap-4 rounded-[1.75rem] p-5 sm:p-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="hero-kicker text-sm font-semibold uppercase">{text.heroEyebrow}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{text.heroTitle}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
              {text.heroDescription}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => retryImages({ copy_ids: failedImageCopyIds, failed_only: true }, 'bulk-failed')}
              disabled={failedImageCopyIds.length === 0 || busyKey === 'bulk-failed'}
              className="rounded-xl bg-red-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-red-300 disabled:bg-slate-300"
            >
              {busyKey === 'bulk-failed' ? text.retrying : text.retryFailedImages(failedImageCopyIds.length)}
            </button>
          </div>
        </div>

        <section className="glass-surface mb-4 grid gap-3 rounded-[1.25rem] p-4 xl:grid-cols-[1fr_1fr_1fr_1fr_1.15fr_auto] xl:items-end">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">SKU</span>
            <input value={sku} onChange={(event) => setSku(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder={text.skuPlaceholder} />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">{text.category}</span>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
              <option value="">{text.allCategories}</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name_zh}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">{text.language}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
              <option value="">{text.allLanguages}</option>
              {PRODUCT_LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">{text.createdDate}</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">{text.shopeeCategory}</span>
            <input
              value={shopeeFilter}
              onChange={(event) => setShopeeFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              placeholder={text.shopeePlaceholder}
            />
          </label>
          <button onClick={fetchCopies} className="rounded-xl bg-slate-950 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-slate-800">
            {text.filter}
          </button>
        </section>

        <section className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              onClick={() => setFilter(item.value)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${filter === item.value ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/15' : 'bg-white/80 text-slate-600 ring-1 ring-slate-200 hover:-translate-y-0.5 hover:bg-white'}`}
            >
              {pickText(uiLanguage, { zh: item.zh, en: item.en })}
            </button>
          ))}
        </section>

        <section className="glass-surface mb-4 rounded-[1.25rem] p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-950">{text.batchActions}</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {text.batchSummary(selectedIds.length, visibleIds.length)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleVisibleSelection}
                disabled={visibleIds.length === 0}
                className="rounded-xl border border-slate-300 bg-white/85 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-white disabled:text-slate-300"
              >
                {allVisibleSelected ? text.clearSelection : text.selectPage}
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                disabled={selectedIds.length === 0}
                className="rounded-xl border border-slate-300 bg-white/85 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-white disabled:text-slate-300"
              >
                {text.clearSelection}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_auto_auto_auto_auto_auto] xl:items-center">
            <input
              value={bulkStoreName}
              onChange={(event) => setBulkStoreName(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white/90 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              placeholder={text.bulkStorePlaceholder}
            />
            <button
              type="button"
              onClick={() => batchUpdateCopies({ listing_status: 'listed' }, 'batch-listed')}
              disabled={selectedIds.length === 0 || busyKey === 'batch-listed'}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-500/15 transition hover:-translate-y-0.5 hover:bg-emerald-700 disabled:bg-slate-300"
            >
              {text.markListed}
            </button>
            <button
              type="button"
              onClick={() => batchUpdateCopies({ store_name: bulkStoreName }, 'batch-store')}
              disabled={selectedIds.length === 0 || !bulkStoreName.trim() || busyKey === 'batch-store'}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/15 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:bg-slate-300"
            >
              {text.setStore}
            </button>
            <button
              type="button"
              onClick={() => retryImages({ copy_ids: selectedIds.length > 0 ? selectedIds : failedImageCopyIds, failed_only: true }, 'batch-selected-failed')}
              disabled={(selectedIds.length === 0 && failedImageCopyIds.length === 0) || busyKey === 'batch-selected-failed'}
              className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-red-500/15 transition hover:-translate-y-0.5 hover:bg-red-700 disabled:bg-slate-300"
            >
              {text.retryFailedBatch}
            </button>
            <button
              type="button"
              onClick={() => exportCopies(true)}
              disabled={selectedIds.length === 0 || busyKey === 'export-selected'}
              className="rounded-xl border border-slate-300 bg-white/85 px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-white disabled:text-slate-300"
            >
              {text.exportSelected}
            </button>
            <button
              type="button"
              onClick={() => exportCopies(false)}
              disabled={copies.length === 0 || busyKey === 'export-all'}
              className="rounded-xl border border-slate-300 bg-white/85 px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-white disabled:text-slate-300"
            >
              {text.exportFiltered}
            </button>
          </div>
        </section>

        {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 shadow-sm">{error}</div>}
        {notice && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700 shadow-sm">{notice}</div>}

        {copies.length === 0 ? (
          <div className="glass-surface rounded-[1.25rem] p-12 text-center">
            <h2 className="text-xl font-semibold text-slate-950">{text.emptyTitle}</h2>
            <p className="mt-2 text-sm text-slate-500">{text.emptyDescription}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {copies.map((copy) => {
              const product = copy.products
              const category = product?.categories
              const images = (copy.product_copy_images || []).sort((a, b) => a.prompt_number - b.prompt_number)
              const completedImages = imageDoneCount(images)
              const listingStatus = statusMeta(copy.listing_status, uiLanguage)
              const copyStatus = copyStatusMeta(copy.status, uiLanguage)
              const cleanTitle = sanitizeListingText(copy.generated_title || product?.source_title)
              const shopeeCategory = formatShopeeCategorySelection(
                decodeShopeeCategorySelection(product?.attributes?.[SHOPEE_CATEGORY_ATTRIBUTE_KEY])
              )
              const listedStore = copy.listing_status === 'listed' ? (copy.store_name?.trim() || text.unrecorded) : ''
              const operator = copy.operator_email || text.unrecorded
              const createdAt = new Date(copy.created_at).toLocaleString()

              return (
                <article
                  key={copy.id}
                  className="glass-surface soft-lift h-[178px] overflow-hidden rounded-[1.25rem] p-4 transition-all hover:border-blue-300"
                >
                  <div className="flex h-full items-center gap-4">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(copy.id)}
                      onChange={() => toggleCopySelection(copy.id)}
                      className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      aria-label={text.selectSku(copy.sku)}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-2xl font-semibold tracking-tight text-slate-950">{copy.sku}</span>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{copy.language_label}{copy.copy_index}</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${copyStatus.tone}`}>{copyStatus.label}</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${listingStatus.tone}`}>{listingStatus.label}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{text.imageCount(completedImages, images.length)}</span>
                      </div>

                      <h2 className="mt-3 line-clamp-2 max-w-4xl text-lg font-semibold leading-7 text-slate-950" title={cleanTitle || undefined}>
                        {cleanTitle || pickText(uiLanguage, { zh: '标题待生成', en: 'Title pending' })}
                      </h2>

                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-medium text-slate-500">
                        <span>{pickText(uiLanguage, { zh: '创建时间', en: 'Created' })}：{createdAt}</span>
                        <span>{pickText(uiLanguage, { zh: '操作者', en: 'Operator' })}：{operator}</span>
                        <span>{category ? `${category.icon} ${category.name_zh}` : text.unlinkedCategory}</span>
                        <span className="max-w-full truncate">{text.shopeeCategory}：{shopeeCategory || text.notTagged}</span>
                      </div>
                    </div>

                    <div className="hidden w-[520px] shrink-0 grid-cols-2 gap-2 xl:grid">
                      <div className="rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-slate-200/80">
                        <div className="text-[11px] font-semibold text-slate-400">{pickText(uiLanguage, { zh: '商品状态', en: 'Copy status' })}</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-800">{copyStatus.label}</div>
                      </div>
                      <div className="rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-slate-200/80">
                        <div className="text-[11px] font-semibold text-slate-400">{pickText(uiLanguage, { zh: '上品状态', en: 'Listing' })}</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-800">
                          {listedStore ? `${listingStatus.label} · ${listedStore}` : listingStatus.label}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-slate-200/80">
                        <div className="text-[11px] font-semibold text-slate-400">{pickText(uiLanguage, { zh: '副本语言', en: 'Language copy' })}</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-800">{copy.language_label}{copy.copy_index}</div>
                      </div>
                      <div className="rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-slate-200/80">
                        <div className="text-[11px] font-semibold text-slate-400">{pickText(uiLanguage, { zh: '图片数量', en: 'Images' })}</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-800">{text.imageCount(completedImages, images.length)}</div>
                      </div>
                      <div className="col-span-2 rounded-2xl bg-orange-50/80 px-4 py-2 ring-1 ring-orange-100">
                        <div className="truncate text-xs font-semibold text-orange-700">
                          {text.shopeeCategory}：{shopeeCategory || text.notTagged}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col gap-2">
                      <Link
                        href={`/product-outputs/${copy.id}`}
                        className="inline-flex h-12 items-center justify-center rounded-2xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5 hover:bg-blue-700"
                      >
                        {text.openDetails}
                      </Link>
                      <button
                        type="button"
                        onClick={() => deleteCopy(copy)}
                        disabled={busyKey === `delete-${copy.id}`}
                        className="inline-flex h-10 items-center justify-center rounded-2xl border border-red-200 bg-white px-6 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {busyKey === `delete-${copy.id}` ? pickText(uiLanguage, { zh: '删除中...', en: 'Deleting...' }) : pickText(uiLanguage, { zh: '删除副本', en: 'Delete copy' })}
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
        {copies.length > 0 && (
          <PaginationBar
            page={copyPage}
            totalPages={copyTotalPages}
            onPageChange={setCopyPage}
            totalLabel={text.pageSummary(copyTotal, Math.min(copyPage, copyTotalPages), copyTotalPages)}
          />
        )}
      </main>
    </div>
  )
}
