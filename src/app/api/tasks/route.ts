import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

type CountableStatus = { status?: string | null }

function countStatuses(rows: CountableStatus[] | null | undefined) {
  return (rows || []).reduce<Record<string, number>>((acc, row) => {
    const status = row.status || 'unknown'
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {})
}

export async function GET(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [{ data: copies, error: copyError }, { data: jobs, error: jobError }] = await Promise.all([
    supabase
      .from('product_copies')
      .select(`
        id,
        sku,
        copy_index,
        language_label,
        status,
        error_message,
        created_at,
        updated_at,
        products(source_title),
        product_copy_images(id,status)
      `)
      .eq('workspace_key', workspaceKey)
      .in('status', ['queued', 'generating'])
      .order('updated_at', { ascending: false })
      .limit(50),
    supabase
      .from('jobs')
      .select('id,status,total_items,completed_items,failed_items,error_message,created_at,updated_at,job_items(id,status)')
      .eq('workspace_key', workspaceKey)
      .in('status', ['queued', 'running'])
      .order('updated_at', { ascending: false })
      .limit(50),
  ])

  if (copyError) {
    return NextResponse.json({ error: copyError.message }, { status: 500 })
  }
  if (jobError) {
    return NextResponse.json({ error: jobError.message }, { status: 500 })
  }

  const productCopyTasks = (copies || []).map((copy) => {
    const product = (Array.isArray(copy.products) ? copy.products[0] : copy.products) as { source_title?: string | null } | null
    return {
    type: 'product_copy',
    id: copy.id,
    sku: copy.sku,
    title: product?.source_title || null,
    label: `${copy.language_label}${copy.copy_index}`,
    status: copy.status,
    created_at: copy.created_at,
    updated_at: copy.updated_at,
    counts: countStatuses(copy.product_copy_images),
    }
  })

  const standaloneImageTasks = (jobs || []).map((job) => ({
    type: 'standalone_image_job',
    id: job.id,
    sku: null,
    title: '单独图片生成任务',
    label: `${job.completed_items || 0}/${job.total_items || 0}`,
    status: job.status,
    created_at: job.created_at,
    updated_at: job.updated_at,
    counts: countStatuses(job.job_items),
  }))

  return NextResponse.json({
    tasks: [...productCopyTasks, ...standaloneImageTasks].sort((a, b) =>
      String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at))
    ),
  })
}
