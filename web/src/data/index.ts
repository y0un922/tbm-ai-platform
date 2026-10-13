import { HttpSource } from './http.ts'
import { LocalReplaySource } from './local.ts'
import type { RunSource } from './source.ts'

export type { RunSource }

// VITE_SOURCE=local（默认，读 web/dev 样本）| http（连后端）
export const source: RunSource = import.meta.env.VITE_SOURCE === 'http' ? new HttpSource() : new LocalReplaySource()
