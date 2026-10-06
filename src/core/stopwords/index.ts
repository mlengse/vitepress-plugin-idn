import type { IdnLanguage } from '../types'
import { STOP_WORDS as ID_WORDS } from './id'
import { STOP_WORDS as EN_WORDS } from './en'

const ID_SET: ReadonlySet<string> = new Set(ID_WORDS)
const EN_SET: ReadonlySet<string> = new Set(EN_WORDS)

/** fnv1a-32 over the joined stop-word list; stable across runs and platforms. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

const SNAPSHOTS: Record<IdnLanguage, string> = {
  id: fnv1a(ID_WORDS.join('\n')),
  en: fnv1a(EN_WORDS.join('\n')),
}

export function getStopWords(language: IdnLanguage): ReadonlySet<string> {
  return language === 'en' ? EN_SET : ID_SET
}

export function isStopWord(word: string, language: IdnLanguage = 'id'): boolean {
  return getStopWords(language).has(word)
}

/** Hash of the stop-word list — the `stopWordsSnapshot` envelope field (FR-012). */
export function stopWordsSnapshot(language: IdnLanguage): string {
  return SNAPSHOTS[language]
}
