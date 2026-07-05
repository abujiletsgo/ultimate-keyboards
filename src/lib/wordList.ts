export const BEGINNER_WORDS: string[] = [
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'it', 'is',
  'for', 'not', 'on', 'with', 'he', 'as', 'do', 'at', 'but', 'by',
  'from', 'or', 'an', 'my', 'we', 'up', 'if', 'who', 'get', 'go',
  'me', 'now', 'out', 'so', 'his', 'its', 'you', 'her', 'him', 'our',
  'see', 'way', 'may', 'say', 'too', 'day', 'use', 'how', 'new', 'two',
  'can', 'let', 'old', 'own', 'put', 'big', 'few', 'far', 'run', 'ask',
]

export const INTERMEDIATE_WORDS: string[] = [
  'about', 'after', 'again', 'being', 'could', 'every', 'first', 'found',
  'given', 'great', 'group', 'house', 'known', 'large', 'light', 'never',
  'often', 'other', 'place', 'right', 'since', 'small', 'still', 'their',
  'there', 'thing', 'think', 'those', 'three', 'under', 'until', 'water',
  'while', 'world', 'would', 'years', 'young', 'always', 'before', 'during',
  'enough', 'follow', 'hands', 'later', 'maybe', 'might', 'money', 'night',
  'point', 'power',
]

export const ADVANCED_WORDS: string[] = [
  'absolute', 'although', 'anything', 'becoming', 'between', 'business',
  'children', 'complete', 'consider', 'continue', 'daughter', 'decision',
  'describe', 'develop', 'different', 'direction', 'discover', 'economic',
  'education', 'everyone', 'example', 'experience', 'following', 'government',
  'however', 'important', 'increase', 'interest', 'language', 'movement',
  'national', 'necessary', 'nothing', 'parents', 'possible', 'probably',
  'question', 'remember', 'research', 'several', 'situation', 'sometimes',
  'specific', 'standard', 'suddenly', 'together', 'understand', 'various',
  'whether', 'without',
]

export function getWordsByDifficulty(
  level: 'beginner' | 'intermediate' | 'advanced'
): string[] {
  switch (level) {
    case 'beginner':
      return [...BEGINNER_WORDS]
    case 'intermediate':
      return [...INTERMEDIATE_WORDS]
    case 'advanced':
      return [...ADVANCED_WORDS]
  }
}

export function getRandomWords(pool: string[], count: number): string[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, shuffled.length))
}
