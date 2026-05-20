import { type ProductImageRole } from './types'

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
  'one',
  'image',
  'product',
  'prompt',
  'create',
  'generate',
])

const DISTINCT_ANGLES: Record<ProductImageRole, string[]> = {
  main: [
    'switch to a different premium display surface, cleaner negative space, and a new lighting direction',
    'use a different camera distance, layered background depth, and a more refined hero-product thumbnail structure',
    'change the background material, reflection style, and product staging while preserving the product exactly',
  ],
  scene: [
    'use a different model pose, visible face or hair when relevant, and a new believable daily-use environment',
    'change the scene location, human interaction style, and lighting mood while keeping the product dominant',
    'avoid a hand-only setup by using a fuller routine scene with natural face or hair context when appropriate',
  ],
  detail: [
    'change the information layout, module hierarchy, close-up texture crop, and supporting material cues',
    'use a different detail-page structure with cleaner verified selling-point zones and stronger product anchoring',
    'change the spec layout, background grid, and texture emphasis without inventing any new claims',
  ],
}

function distinctAngle(role: ProductImageRole, seed: number) {
  const pool = DISTINCT_ANGLES[role]
  return pool[Math.abs(seed) % pool.length]
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
}

function tokenSet(value: string) {
  return new Set(tokenize(value))
}

function jaccardScore(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0
  let intersection = 0
  Array.from(left).forEach((item) => {
    if (right.has(item)) intersection += 1
  })
  return (2 * intersection) / (left.size + right.size)
}

function phraseBigrams(value: string) {
  const tokens = tokenize(value)
  const bigrams = new Set<string>()
  for (let index = 0; index < tokens.length - 1; index += 1) {
    bigrams.add(`${tokens[index]} ${tokens[index + 1]}`)
  }
  return bigrams
}

export function promptSimilarityScore(left: string, right: string) {
  const tokenOverlap = jaccardScore(tokenSet(left), tokenSet(right))
  const phraseOverlap = jaccardScore(phraseBigrams(left), phraseBigrams(right))
  return Number((tokenOverlap * 0.72 + phraseOverlap * 0.28).toFixed(4))
}

export function mostSimilarPrompt(prompt: string, existingPrompts: string[] = []) {
  return existingPrompts.reduce(
    (best, existing) => {
      const score = promptSimilarityScore(prompt, existing)
      return score > best.score ? { prompt: existing, score } : best
    },
    { prompt: '', score: 0 }
  )
}

export function isPromptTooSimilar(prompt: string, existingPrompts: string[] = [], threshold = 0.52) {
  return mostSimilarPrompt(prompt, existingPrompts).score >= threshold
}

export function ensurePromptDistinct(input: {
  prompt: string
  existingPrompts?: string[]
  role: ProductImageRole
  variantSeed?: number
  threshold?: number
}) {
  const existingPrompts = input.existingPrompts || []
  const similarity = mostSimilarPrompt(input.prompt, existingPrompts)
  const threshold = input.threshold ?? 0.52
  if (similarity.score < threshold) return input.prompt

  const angle = distinctAngle(input.role, Math.max(1, input.variantSeed || existingPrompts.length + 1))
  return [
    input.prompt.replace(/\s+/g, ' ').trim(),
    `Distinct variation direction: ${angle}.`,
    'Avoid repeating the same background material, scene structure, camera distance, and lighting pattern used by existing prompts in this category.',
  ].join(' ')
}
