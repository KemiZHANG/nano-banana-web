import { normalizeProductImageRole, type ProductImageRole } from './types'

export type CategoryVisualTarget = {
  name_zh?: string | null
  slug?: string | null
}

export function getCategoryEnglishSubject(category: CategoryVisualTarget) {
  const slug = String(category.slug || '').trim()
  if (slug) {
    return slug
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase())
  }
  return String(category.name_zh || 'Product').trim()
}

export function getCategoryVisualGuidance(category: CategoryVisualTarget) {
  const normalized = `${category.slug || ''} ${category.name_zh || ''}`.toLowerCase()

  if (normalized.includes('cleanser') || normalized.includes('wash') || normalized.includes('洗面') || normalized.includes('洁面')) {
    return 'fresh cleansing skincare cues, clean water glow, soft foam texture, bathroom vanity, transparent acrylic or glass details'
  }
  if (normalized.includes('toner') || normalized.includes('水')) {
    return 'clear watery texture, transparent glass, light blue and clean white atmosphere, soft reflections and hydrated freshness'
  }
  if (normalized.includes('serum') || normalized.includes('精华')) {
    return 'premium skincare serum cues, refined reflections, subtle liquid texture, glass or chrome accents, precise luxury composition'
  }
  if (normalized.includes('mask') || normalized.includes('面膜')) {
    return 'hydrating skincare routine cues, soft facial-care mood, clean vanity scene, restrained botanical or glass elements'
  }
  if (normalized.includes('lip') || normalized.includes('唇')) {
    return 'beauty cosmetic counter cues, glossy texture, mirror reflection, elegant color harmony, editorial product styling'
  }
  if (normalized.includes('hair') || normalized.includes('头发') || normalized.includes('护发')) {
    return 'haircare usage cues, visible healthy hair texture, salon-inspired lighting, clean bathroom or dressing-table context'
  }
  if (normalized.includes('fragrance') || normalized.includes('香')) {
    return 'luxury fragrance mood, glass reflections, soft shadow, elegant dressing table, premium editorial still life'
  }
  if (normalized.includes('children') || normalized.includes('儿童') || normalized.includes('baby') || normalized.includes('婴')) {
    return 'gentle child-care atmosphere, warm soft light, clean safe feeling, rounded props, no exaggerated medical or safety claims'
  }
  if (normalized.includes('sun') || normalized.includes('sunscreen') || normalized.includes('防晒')) {
    return 'fresh daylight, airy summer atmosphere, clean outdoor or vanity context, blue-white transparent materials'
  }
  if (normalized.includes('tissue') || normalized.includes('纸巾')) {
    return 'soft paper texture, clean household setting, warm daylight, gentle fabric and tabletop material contrast'
  }

  return 'premium ecommerce product photography, refined background, clean props, layered depth, realistic light and material details'
}

const mainAngles = [
  'premium studio hero composition on a low acrylic riser with soft reflection and generous clean negative space',
  'editorial product-first still life with a subtle marble or ceramic base, controlled side lighting, and crisp shelf-ready readability',
  'clean commercial hero shot with layered translucent panels, soft shadow, and a refined high-end ecommerce thumbnail structure',
  'minimal premium display with the product centered, a gentle reflective surface, and background depth created by light rather than clutter',
]

const sceneAngles = [
  'realistic usage scene with a visible model face when relevant, natural skin or hair texture, and the product clearly readable in the foreground',
  'premium daily-use moment with a model in a clean bathroom or dressing-table setting, product dominant and not blocked by hands or props',
  'soft lifestyle scene showing believable use context and a human presence, with the model supporting the product instead of becoming the main subject',
  'editorial routine scene with face or hair visible for skincare and haircare categories, natural expression, clean background, and accurate product packaging',
]

const detailAngles = [
  'detail or infographic layout with three to four clean information zones, close-up material texture, and the product anchored as the visual reference',
  'premium ecommerce detail image with concise verified selling-point modules, clean dividers, texture close-up, and strong product-label clarity',
  'structured specification and usage layout with restrained short English text, clear hierarchy, and no invented certifications or unsupported claims',
  'clean detail-page composition showing packaging, texture, material, volume, or usage information in a polished ecommerce layout',
]

export function getRoleCompositionAngle(role: ProductImageRole, seed: number) {
  const pool = role === 'main' ? mainAngles : role === 'scene' ? sceneAngles : detailAngles
  return pool[Math.abs(seed) % pool.length]
}

export function roleGoal(role: string | null | undefined) {
  const normalized = normalizeProductImageRole(role)
  if (normalized === 'main') {
    return 'one main ecommerce hero image'
  }
  if (normalized === 'scene') {
    return 'one realistic lifestyle usage scene image'
  }
  if (normalized === 'detail') {
    return 'one detail or infographic ecommerce image'
  }
  return 'one ecommerce product image'
}
