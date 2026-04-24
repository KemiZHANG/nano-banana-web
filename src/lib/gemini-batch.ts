const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com'
export const GEMINI_BATCH_MODEL = 'gemini-2.5-flash-image'

export type GeminiBatchMeta = {
  kind: 'gemini_batch'
  batchName: string
  inputFileName: string
  createdAt: string
}

type GeminiBatchStatus = {
  name?: string
  state?: string
  done?: boolean
  metadata?: {
    state?: string
  }
  response?: {
    responsesFile?: string
    responses_file?: string
  }
  dest?: {
    fileName?: string
    file_name?: string
  }
  error?: {
    message?: string
  } | string
}

export function encodeBatchMeta(meta: GeminiBatchMeta) {
  return `__GEMINI_BATCH__${JSON.stringify(meta)}`
}

export function decodeBatchMeta(value: string | null | undefined): GeminiBatchMeta | null {
  if (!value?.startsWith('__GEMINI_BATCH__')) return null
  try {
    return JSON.parse(value.slice('__GEMINI_BATCH__'.length)) as GeminiBatchMeta
  } catch {
    return null
  }
}

export function getBatchState(batch: GeminiBatchStatus) {
  return batch.state || batch.metadata?.state || 'JOB_STATE_UNSPECIFIED'
}

export function getBatchResultFile(batch: GeminiBatchStatus) {
  return (
    batch.dest?.fileName ||
    batch.dest?.file_name ||
    batch.response?.responsesFile ||
    batch.response?.responses_file ||
    null
  )
}

export function getBatchErrorMessage(batch: GeminiBatchStatus) {
  if (!batch.error) return null
  if (typeof batch.error === 'string') return batch.error
  return batch.error.message || JSON.stringify(batch.error)
}

export async function uploadBatchInputFile(apiKey: string, jsonl: string, displayName: string) {
  const buffer = Buffer.from(jsonl, 'utf-8')
  const startRes = await fetch(`${GEMINI_API_BASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(buffer.length),
      'X-Goog-Upload-Header-Content-Type': 'application/jsonl',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file: {
        display_name: displayName,
      },
    }),
  })

  if (!startRes.ok) {
    throw new Error(`Gemini file upload start failed ${startRes.status}: ${await startRes.text()}`)
  }

  const uploadUrl = startRes.headers.get('x-goog-upload-url')
  if (!uploadUrl) {
    throw new Error('Gemini file upload URL was not returned')
  }

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(buffer.length),
      'Content-Type': 'application/jsonl',
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: buffer,
  })

  if (!uploadRes.ok) {
    throw new Error(`Gemini file upload failed ${uploadRes.status}: ${await uploadRes.text()}`)
  }

  const data = await uploadRes.json()
  const fileName = data?.file?.name || data?.name
  if (!fileName) {
    throw new Error('Gemini file upload did not return a file name')
  }

  return fileName as string
}

export async function createGeminiBatch(apiKey: string, inputFileName: string, displayName: string) {
  const res = await fetch(`${GEMINI_API_BASE}/v1beta/models/${GEMINI_BATCH_MODEL}:batchGenerateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      batch: {
        display_name: displayName,
        input_config: {
          file_name: inputFileName,
        },
      },
    }),
  })

  if (!res.ok) {
    throw new Error(`Gemini batch create failed ${res.status}: ${await res.text()}`)
  }

  const data = await res.json()
  const batchName = data?.name || data?.batch?.name
  if (!batchName) {
    throw new Error('Gemini batch create did not return a batch name')
  }

  return batchName as string
}

export async function getGeminiBatch(apiKey: string, batchName: string): Promise<GeminiBatchStatus> {
  const res = await fetch(`${GEMINI_API_BASE}/v1beta/${batchName}`, {
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`Gemini batch status failed ${res.status}: ${await res.text()}`)
  }

  return res.json()
}

export async function cancelGeminiBatch(apiKey: string, batchName: string) {
  const res = await fetch(`${GEMINI_API_BASE}/v1beta/${batchName}:cancel`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`Gemini batch cancel failed ${res.status}: ${await res.text()}`)
  }
}

export async function downloadGeminiFile(apiKey: string, fileName: string) {
  const res = await fetch(`${GEMINI_API_BASE}/download/v1beta/${fileName}:download?alt=media`, {
    headers: {
      'x-goog-api-key': apiKey,
    },
  })

  if (!res.ok) {
    throw new Error(`Gemini result download failed ${res.status}: ${await res.text()}`)
  }

  return res.text()
}
