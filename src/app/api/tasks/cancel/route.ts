import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

export async function POST(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const type = String(body?.type || '')
  const id = String(body?.id || '')
  if (!id || !type) {
    return NextResponse.json({ error: 'type and id are required' }, { status: 400 })
  }

  if (type === 'standalone_image_job') {
    const { data: job } = await supabase
      .from('jobs')
      .select('id,status')
      .eq('id', id)
      .eq('workspace_key', workspaceKey)
      .maybeSingle()

    if (!job) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    await supabase
      .from('job_items')
      .update({ status: 'cancelled', error_message: '已取消，不再继续生成。' })
      .eq('job_id', id)
      .in('status', ['pending', 'running'])

    await supabase
      .from('jobs')
      .update({ status: 'cancelled', error_message: '已取消，不再继续生成。' })
      .eq('id', id)
      .eq('workspace_key', workspaceKey)

    return NextResponse.json({ ok: true })
  }

  if (type === 'product_copy') {
    const { data: copy } = await supabase
      .from('product_copies')
      .select('id,product_id')
      .eq('id', id)
      .eq('workspace_key', workspaceKey)
      .maybeSingle()

    if (!copy) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    await supabase
      .from('product_copy_images')
      .update({ status: 'failed', error_message: '已取消，不再继续生成。' })
      .eq('copy_id', id)
      .in('status', ['queued', 'generating'])

    await supabase
      .from('product_copies')
      .update({ status: 'needs_review', error_message: '已取消后续图片生成，已成功生成的结果保留。' })
      .eq('id', id)
      .eq('workspace_key', workspaceKey)

    await supabase
      .from('products')
      .update({ status: 'needs_review', error_message: '有副本任务已取消，请进入商品副本输出查看。' })
      .eq('id', copy.product_id)
      .eq('workspace_key', workspaceKey)

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unsupported task type' }, { status: 400 })
}
