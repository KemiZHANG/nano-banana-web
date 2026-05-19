import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'
import { buildSynchronizedCategoryPrompt } from '@/lib/category-prompt-sync'
import { getPromptRoleFromRow } from '@/lib/category-prompts'
import { normalizeProductImageRole, type ProductImageRole } from '@/lib/types'

type CategoryRow = {
  id: string
  name_zh: string | null
  slug: string | null
}

type PromptRow = {
  category_id?: string | null
  prompt_number: number
  prompt_role?: string | null
  prompt_text?: string | null
}

function nextPromptNumber(prompts: PromptRow[] | null | undefined) {
  return Math.max(0, ...(prompts || []).map((prompt) => Number(prompt.prompt_number || 0))) + 1
}

async function insertPrompt(
  supabase: ReturnType<typeof getWorkspaceSupabase>,
  categoryId: string,
  promptRole: string,
  promptText: string
) {
  const { data: existingPrompts, error: readError } = await supabase
    .from('category_prompts')
    .select('prompt_number')
    .eq('category_id', categoryId)
    .order('prompt_number', { ascending: true })

  if (readError) {
    return { data: null, error: readError }
  }

  return supabase
    .from('category_prompts')
    .insert({
      category_id: categoryId,
      prompt_number: nextPromptNumber(existingPrompts || []),
      prompt_role: promptRole,
      prompt_text: promptText,
    })
    .select()
    .single()
}

async function syncPromptToOtherCategories(input: {
  supabase: ReturnType<typeof getWorkspaceSupabase>
  workspaceKey: string
  sourceCategory: CategoryRow
  sourcePrompt: string
  role: ProductImageRole
}) {
  const { supabase, workspaceKey, sourceCategory, sourcePrompt, role } = input
  const { data: categories, error: categoryError } = await supabase
    .from('categories')
    .select('id,name_zh,slug')
    .eq('workspace_key', workspaceKey)
    .neq('id', sourceCategory.id)
    .order('sort_order', { ascending: true })

  if (categoryError || !categories?.length) {
    return { count: 0, error: categoryError || null }
  }

  const targetIds = categories.map((category) => category.id)
  const { data: prompts, error: promptError } = await supabase
    .from('category_prompts')
    .select('category_id,prompt_number,prompt_role,prompt_text')
    .in('category_id', targetIds)
    .order('prompt_number', { ascending: true })

  if (promptError) {
    return { count: 0, error: promptError }
  }

  const promptsByCategory = new Map<string, PromptRow[]>()
  for (const prompt of prompts || []) {
    const rows = promptsByCategory.get(String(prompt.category_id)) || []
    rows.push(prompt)
    promptsByCategory.set(String(prompt.category_id), rows)
  }

  const rowsToInsert = categories.map((category) => {
    const existingPrompts = promptsByCategory.get(category.id) || []
    const sameRolePrompts = existingPrompts
      .filter((prompt) => getPromptRoleFromRow(prompt) === role)
      .map((prompt) => prompt.prompt_text || '')
      .filter(Boolean)

    return {
      category_id: category.id,
      prompt_number: nextPromptNumber(existingPrompts),
      prompt_role: role,
      prompt_text: buildSynchronizedCategoryPrompt({
        role,
        sourcePrompt,
        sourceCategory,
        targetCategory: category,
        existingPrompts: sameRolePrompts,
        variantIndex: sameRolePrompts.length,
      }),
    }
  })

  const { error: insertError } = await supabase
    .from('category_prompts')
    .insert(rowsToInsert)

  return { count: insertError ? 0 : rowsToInsert.length, error: insertError || null }
}

export async function POST(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const categoryId = String(body.category_id || '').trim()
  const promptText = String(body.prompt_text || '').trim()
  const rawPromptRole = String(body.prompt_role || 'custom').trim()

  if (!categoryId || !promptText) {
    return NextResponse.json({ error: 'category_id and prompt_text are required' }, { status: 400 })
  }

  const { data: category } = await supabase
    .from('categories')
    .select('id,name_zh,slug')
    .eq('id', categoryId)
    .eq('workspace_key', workspaceKey)
    .maybeSingle()

  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  const normalizedRole = normalizeProductImageRole(rawPromptRole)
  const promptRole = normalizedRole || rawPromptRole || 'custom'
  const { data, error } = await insertPrompt(supabase, categoryId, promptRole, promptText)

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to create prompt' }, { status: 500 })
  }

  let syncedCount = 0
  if (normalizedRole && body.sync_to_all_categories !== false) {
    const syncResult = await syncPromptToOtherCategories({
      supabase,
      workspaceKey,
      sourceCategory: category,
      sourcePrompt: promptText,
      role: normalizedRole,
    })
    if (syncResult.error) {
      return NextResponse.json({
        ...data,
        synced_count: syncedCount,
        sync_warning: syncResult.error.message,
      }, { status: 201 })
    }
    syncedCount = syncResult.count
  }

  return NextResponse.json({
    ...data,
    synced_count: syncedCount,
  }, { status: 201 })
}
