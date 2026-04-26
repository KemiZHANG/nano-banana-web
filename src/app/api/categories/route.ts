import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getRequestSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: categories, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const categoryIds = (categories || []).map((cat) => cat.id)
  const [promptRes, imageRes] = categoryIds.length > 0
    ? await Promise.all([
        supabase.from('category_prompts').select('category_id').in('category_id', categoryIds),
        supabase.from('category_images').select('category_id').in('category_id', categoryIds),
      ])
    : [{ data: [] }, { data: [] }]

  const promptCounts = new Map<string, number>()
  for (const prompt of promptRes.data || []) {
    promptCounts.set(prompt.category_id, (promptCounts.get(prompt.category_id) || 0) + 1)
  }

  const imageCounts = new Map<string, number>()
  for (const image of imageRes.data || []) {
    imageCounts.set(image.category_id, (imageCounts.get(image.category_id) || 0) + 1)
  }

  const enriched = (categories || []).map((cat) => ({
    ...cat,
    prompt_count: promptCounts.get(cat.id) || 0,
    image_count: imageCounts.get(cat.id) || 0,
  }))

  return NextResponse.json(enriched)
}

export async function POST(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name_zh, slug, icon } = body

  if (!name_zh || !slug) {
    return NextResponse.json({ error: 'name_zh and slug are required' }, { status: 400 })
  }

  // Check slug uniqueness per user
  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', user.id)
    .eq('slug', slug)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
  }

  // Get current max sort_order
  const { data: maxSort } = await supabase
    .from('categories')
    .select('sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextSortOrder = (maxSort?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('categories')
    .insert({
      user_id: user.id,
      name_zh,
      slug,
      icon: icon || '📦',
      sort_order: nextSortOrder,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
