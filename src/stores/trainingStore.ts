import { create } from 'zustand'

type Difficulty = 'beginner' | 'intermediate' | 'advanced'

interface TrainingState {
  chordWindowMs: number
  difficulty: Difficulty
  currentChord: Set<string>
  setChordWindow: (ms: number) => void
  setDifficulty: (d: Difficulty) => void
  setCurrentChord: (c: Set<string>) => void
}

export const useTrainingStore = create<TrainingState>()((set) => ({
  chordWindowMs: 80,
  difficulty: 'beginner',
  // Zustand v5 supports Set directly — won't be serializable but that's fine
  currentChord: new Set<string>(),

  setChordWindow: (ms) => set({ chordWindowMs: ms }),
  setDifficulty: (d) => set({ difficulty: d }),
  setCurrentChord: (c) => set({ currentChord: new Set(c) }),
}))
