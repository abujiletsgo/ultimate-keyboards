import type { Rule } from '../karabinerGenerator'
import { modifierLong } from '../platform'
import type { KeyTemplate } from './index'

/**
 * The catalog is written for the Mac. On Windows copy, paste and undo use Ctrl, so a home-row
 * template that holds Command for shortcuts holds Ctrl instead (Command <-> Control swap), and
 * the words drop Mac names. Caps Lock keeps Control: Ctrl is already the Windows shortcut key.
 * Rule format stays the Mac vocabulary; on Windows command is Win, option is Alt.
 */

const SWAP: Record<string, string> = { command: 'control', control: 'command' }
const swapShortcutKey = (mod: string): string =>
  mod.replace(/(command|control)$/, f => SWAP[f])

type Copy = Partial<Pick<KeyTemplate, 'name' | 'shortName' | 'blurb' | 'why' | 'forWho' | 'changes' | 'caution' | 'source'>> & { videoNote?: string }

const GUIDE = 'https://precondition.github.io/home-row-mods'

const COPY: Record<string, Copy> = {
  'caps-esc-ctrl': {
    name: 'Caps Lock: Escape and Ctrl',
    shortName: 'Caps Lock: Escape and Ctrl',
    blurb: 'Caps Lock becomes Escape when tapped and Ctrl when held.',
    why: 'Caps Lock is a big key in a great spot that almost nobody needs. Now a quick tap is Escape, and holding it is Ctrl, so shortcuts like Ctrl+C are easy to reach.',
    changes: ['Tap Caps Lock: Escape', 'Hold Caps Lock and press another key: Ctrl', 'Caps Lock no longer shouts in capital letters'],
    caution: 'Hold it a moment longer to get Ctrl. If you type very fast right before it, it may give Escape instead.',
    videoNote: 'Shows tap for Escape and hold for Ctrl on Caps Lock, and why it helps.',
    source: {
      title: 'Raycast manual, Hyper Key: Caps Lock "Quick Press" can send Escape',
      url: 'https://manual.raycast.com/hyper-key',
      note: 'A popular keyboard app offers a tap-for-Escape on Caps Lock, so it is an expected choice.',
    },
  },
  'home-row-starter': {
    name: 'Home row starter: Shift and Ctrl',
    blurb: 'Hold D, F, J or K for Ctrl or Shift. A tap still types the letter.',
    why: 'Your fingers rest on A S D F and J K L ;. Hold F or J to get Shift, hold D or K to get Ctrl, without moving your hand. Just four keys, so it is a gentle way to try the idea.',
    changes: [
      'Hold F or J: Shift',
      'Hold D or K: Ctrl',
      'Tapping the same keys types the letter as usual',
      'A key only turns into a modifier when you press a key from the other hand',
    ],
    videoNote: 'Explains why modifiers on the home row are easier on the wrist. This template uses just the Shift and Ctrl part.',
  },
  // Swapped, the Mac GACS set puts Ctrl on the pinky, where it sits on a normal keyboard.
  'home-row-gacs': {
    name: 'Home row mods: Ctrl, Alt, Win, Shift',
    shortName: 'Home row mods (Ctrl on pinky)',
    why: 'Each finger on the home row also works as a shortcut key when you hold it: pinky is Ctrl, then Alt, Win, and the pointer finger is Shift. Same on both hands. Your hands never leave the middle row.',
    forWho: 'People who want Ctrl under the pinky, where it sits on a normal keyboard.',
    changes: ['Hold A or ;: Ctrl', 'Hold S or L: Alt', 'Hold D or K: Win', 'Hold F or J: Shift', 'Tapping any of them types the letter'],
    videoNote: 'Shows eight home-row keys used as modifiers, and says he runs it on laptop keyboards too. His own order differs slightly; the idea is the same.',
    source: {
      title: 'A guide to home row mods (Precondition): modifier orders',
      url: GUIDE,
      note: 'Compares the common orders. This one keeps Ctrl on the pinky.',
    },
  },
  // Swapped, the Mac CAGS set puts Ctrl on the strong middle finger: the GACS order the guide suggests for Windows.
  'home-row-cags': {
    name: 'Home row mods: Win, Alt, Ctrl, Shift',
    shortName: 'Home row mods (Ctrl on middle)',
    blurb: 'The same idea, with Ctrl on a stronger finger for copy and paste.',
    why: 'Like the other home-row set, but Ctrl, the key Windows uses most (copy, paste, undo), goes on your strong middle finger, and Win, which you use least, goes on the pinky.',
    forWho: 'People who use Ctrl shortcuts all day. Guides call this order GACS and say to pick it if you are not sure.',
    changes: ['Hold A or ;: Win', 'Hold S or L: Alt', 'Hold D or K: Ctrl', 'Hold F or J: Shift', 'Tapping any of them types the letter'],
    videoNote: 'A demo of home-row mods with all four shortcut keys, plus how to stop accidental capitals. His letter order differs; the idea is the same.',
    source: {
      title: 'A guide to home row mods (Precondition): GACS section',
      url: GUIDE,
      note: 'Says "if you\'re undecided, pick GACS" and that it is the order used by Miryoku.',
    },
  },
  'space-arrows': {
    changes: [
      'Tap Space: a space',
      'Hold Space, press H: Left Arrow',
      'Hold Space, press J: Down Arrow',
      'Hold Space, press K: Up Arrow',
      'Hold Space, press L: Right Arrow',
      'Add Ctrl or Shift to jump or select as usual',
    ],
  },
  'symbols-layer': {
    blurb: 'Hold Right Alt and type symbols without Shift.',
    why: 'Hold the right Alt key and the keys under your left hand type symbols like & * ( ) $ % ^ ! @ #. No Shift needed, so shortcuts with symbols are easier.',
    changes: [
      'Hold Right Alt: symbols on the left hand',
      'W E R T is & * ( )',
      'S D F is $ % ^',
      'X C V is ! @ #',
      'Right Alt does nothing else while this is on',
    ],
    caution: 'Right Alt stops working as Alt. Some keyboard layouts use Right Alt as AltGr to type accents and extra symbols, so skip this if you use those.',
  },
}

/** Mac words in a rule description, said the Windows way. */
const winWords = (text: string): string =>
  text.replace(/\bCommand\b/g, 'Win').replace(/\bOption\b/g, 'Alt').replace(/\bControl\b/g, 'Ctrl')

function windowsRule(rule: Rule, swap: boolean): Rule {
  if (rule.type !== 'homerow_mod') return { ...rule, description: winWords(rule.description) } as Rule
  const modKey = swap ? swapShortcutKey(rule.modKey) : rule.modKey
  return { ...rule, modKey, description: rule.description.replace(/hold is \w+$/, `hold is ${modifierLong(modKey, 'windows')}`) }
}

/** One template as Windows shows and applies it. */
export function windowsTemplate(template: KeyTemplate): KeyTemplate {
  const { videoNote, ...copy } = COPY[template.id] ?? {}
  const swap = template.category === 'home-row'
  return {
    ...structuredClone(template),
    ...structuredClone(copy),
    rules: template.rules.map(rule => windowsRule(structuredClone(rule), swap)),
    video: { ...template.video, ...(videoNote ? { note: videoNote } : {}) },
  }
}
