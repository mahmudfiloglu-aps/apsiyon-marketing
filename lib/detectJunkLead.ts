import type { LeadRow, AnalysisResult } from '@/types/lead'

const JUNK_KEYWORDS = [
  'test', 'deneme', 'örnek', 'dummy', 'sample',
  'asdf', 'qwer', 'zxcv', 'aaaa', 'bbbb', 'xxxx', 'yyyy', 'zzzz',
  'aaa', 'bbb', 'xxx', 'zzz', 'abc',
]

const TURKISH_VOWELS = /[aeıioöuüAEIİOÖUÜ]/g
const LETTERS = /[a-zA-ZğüşıöçĞÜŞİÖÇ]/g
const IS_VOWEL = /[aeıioöuüAEIİOÖUÜ]/
const IS_LETTER = /[a-zA-ZğüşıöçĞÜŞİÖÇ]/

function junkResult(reason: string): AnalysisResult {
  return {
    leadId: '',
    originalStatus: 'Uygun Bulunmadı',
    originalDetail: '',
    suggestedStatus: 'Yanlış Kayıt',
    confidence: 'Yüksek',
    reason,
    matchedServices: [],
    qualityScore: 1,
  }
}

export function detectJunkLead(lead: LeadRow): AnalysisResult | null {
  const name = (lead['İlgili Kişi'] || '').trim()
  const note = (lead['Son Aktivite Açıklaması'] || '').trim().toLowerCase()
  const nameLower = name.toLowerCase()

  // Test keyword in name
  if (JUNK_KEYWORDS.some((kw) => nameLower.includes(kw))) {
    return junkResult(`İsim alanında "${name}" — test veya anlamsız giriş tespit edildi.`)
  }

  // Digits in name (e.g. "güzel güzel 2027", "Lead 123")
  if (/\d/.test(name)) {
    return junkResult(`İsim alanında rakam var ("${name}") — muhtemelen hatalı veya test girişi.`)
  }

  // Repeated words ("güzel güzel", "test test")
  const words = nameLower.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    const unique = new Set(words)
    if (unique.size < words.length) {
      return junkResult(`İsimde tekrarlayan kelimeler var ("${name}") — muhtemelen hatalı giriş.`)
    }
  }

  // Gibberish detection on each word in the name
  if (name.length >= 3) {
    const allWords = name.split(/\s+/)
    for (const word of allWords) {
      if (word.length < 3) continue
      const vowels = (word.match(TURKISH_VOWELS) || []).length
      const letters = (word.match(LETTERS) || []).length

      // Very low vowel ratio
      if (letters >= 4 && vowels / letters < 0.15) {
        return junkResult(`İsimde anlamsız karakter dizisi var ("${word}") — rastgele tuş girişi olabilir.`)
      }

      // 3+ consecutive consonants in a word (phonetically impossible in Turkish names)
      if (letters >= 4) {
        let run = 0
        let maxRun = 0
        for (const ch of word) {
          if (IS_VOWEL.test(ch)) {
            run = 0
          } else if (IS_LETTER.test(ch)) {
            maxRun = Math.max(maxRun, ++run)
          }
        }
        if (maxRun >= 3) {
          return junkResult(`İsimde Türkçe fonetik yapısına uymayan sessiz harf dizisi var ("${word}") — geçersiz giriş.`)
        }
      }
    }
  }

  // Test keyword at start of sales note (e.g. "test test", "deneme")
  if (JUNK_KEYWORDS.some((kw) => note === kw || note.startsWith(kw + ' ') || note.startsWith(kw + '.'))) {
    return junkResult(`Satışçı notunda test/anlamsız giriş tespit edildi ("${lead['Son Aktivite Açıklaması']}").`)
  }

  return null
}
