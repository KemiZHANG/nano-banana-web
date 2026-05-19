import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const { data: output, error: lookupError } = await supabase
    .from('outputs')
    .select('id, storage_path')
    .eq('id', id)
    .eq('workspace_key', workspaceKey)
    .maybeSingle()

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }

  if (!output) {
    return NextResponse.json({ error: 'Output not found' }, { status: 404 })
  }

  if (output.storage_path) {
    await supabase.storage.from('outputs').remove([output.storage_path])
  }

  const { error } = await supabase
    .from('outputs')
    .delete()
    .eq('id', id)
    .eq('workspace_key', workspaceKey)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
