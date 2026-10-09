import { createModels } from '@earendil-works/pi-ai'
import { deepseekProvider } from '@earendil-works/pi-ai/providers/deepseek'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// 凭证优先读环境变量，否则读本机 pi 的 ~/.pi/agent/auth.json，不进仓库
function loadDeepseekKey() {
  if (process.env.DEEPSEEK_API_KEY) return
  try {
    const auth = JSON.parse(readFileSync(join(homedir(), '.pi', 'agent', 'auth.json'), 'utf8'))
    if (auth.deepseek?.key) process.env.DEEPSEEK_API_KEY = auth.deepseek.key
  } catch {}
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('缺少 DeepSeek 凭证：设置 DEEPSEEK_API_KEY 或在 pi 中登录 deepseek')
}

export const MODEL_ID = process.env.TBM_MODEL ?? 'deepseek-flash'

export function setupModel() {
  loadDeepseekKey()
  const models = createModels()
  models.setProvider(deepseekProvider())
  const model = models.getModel('deepseek', MODEL_ID)
  if (!model) throw new Error(`找不到模型 deepseek/${MODEL_ID}`)
  return { model, streamFn: models.streamSimple.bind(models) }
}
