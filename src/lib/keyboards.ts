// Registry of the user's ZMK keyboards. Each maps to a local keymap file
// (one git branch per keyboard in the cross_keyboard repo, the crosses branch
// checked out as a worktree so both files exist simultaneously).
// Selection persists across sessions via localStorage.

export interface ZMKKeyboardDef {
  id: string
  /** Short display name shown in the keyboard switcher */
  name: string
  /** Pointing device / flavor hint shown as a subtitle */
  variant: string
  keymapPath: string
}

export const ZMK_KEYBOARDS: ZMKKeyboardDef[] = [
  {
    id: 'corne',
    name: 'Corne',
    variant: 'trackpad',
    keymapPath: '/Users/tomkwon/Documents/cross_keyboard/config/corne_tp.keymap',
  },
  {
    id: 'crosses',
    name: 'Crosses',
    variant: 'trackball',
    keymapPath: '/Users/tomkwon/Documents/cross_keyboard-crosses/config/crosses.keymap',
  },
]

const SELECTED_KEY = 'uk.zmk.selectedKeyboard'

export function getSelectedKeyboard(): ZMKKeyboardDef {
  const id = localStorage.getItem(SELECTED_KEY)
  return ZMK_KEYBOARDS.find(k => k.id === id) ?? ZMK_KEYBOARDS[0]
}

export function setSelectedKeyboard(id: string): void {
  localStorage.setItem(SELECTED_KEY, id)
}
