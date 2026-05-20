import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'
import vm from 'node:vm'

const repoRoot = process.cwd()
const require = createRequire(import.meta.url)
const sourcePath = path.join(repoRoot, 'src/lib/prompt-similarity.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText

const module = { exports: {} }
vm.runInNewContext(compiled, {
  module,
  exports: module.exports,
  require,
}, { filename: sourcePath })

const {
  promptSimilarityScore,
  isPromptTooSimilar,
  ensurePromptDistinct,
} = module.exports

const promptA = 'Create one premium ecommerce main image for facial cleanser on a clean acrylic riser with soft reflection, bright studio lighting, and preserved packaging text.'
const promptB = 'Create a premium ecommerce main product image for facial cleanser on an acrylic platform with clean studio light, soft reflections, and unchanged packaging wording.'
const promptC = 'Create a realistic lifestyle skincare scene with a visible model face in a bathroom routine, natural skin texture, clean vanity props, and the product readable in the foreground.'

assert(promptSimilarityScore(promptA, promptB) > 0.52, 'similar prompts should score high')
assert(promptSimilarityScore(promptA, promptC) < 0.52, 'different role prompts should score lower')
assert.equal(isPromptTooSimilar(promptA, [promptB]), true, 'similar prompt should be flagged')
assert.equal(isPromptTooSimilar(promptA, [promptC]), false, 'different prompt should not be flagged')

const distinct = ensurePromptDistinct({
  prompt: promptA,
  existingPrompts: [promptB],
  role: 'main',
  variantSeed: 2,
})

assert.notEqual(distinct, promptA, 'too-similar prompt should be rewritten with a distinction guard')
assert.match(distinct, /Distinct variation direction/i)

console.log('prompt similarity checks passed')
