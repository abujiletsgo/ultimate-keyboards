/**
 * Per-keyboard pointing-device descriptors: which overlay file holds the
 * sensor + listener nodes, and which controls the device supports.
 */

export interface PointingDevice {
  keyboardId: 'corne' | 'crosses'
  keyboardName: string
  deviceName: string
  /** e.g. "Azoteq IQS5XX trackpad" */
  chip: string
  overlayPath: string
  /** regex source (string, so it stays serializable) for the sensor node */
  sensorNodeRe: string
  /** regex source for the input-listener node */
  listenerNodeRe: string
  /** which control groups this device supports */
  supports: {
    cursorScaler: boolean
    chipSensitivity: boolean   // Azoteq sensitivity="1x..4x"
    cpi: boolean               // PMW3610 res-cpi
    invertXY: boolean          // PMW3610 invert-x / invert-y
    smartMode: boolean         // PMW3610 smart-mode
    scrollToggles: boolean     // Azoteq scroll + natural-scroll-x/y
    gestures: boolean          // Azoteq taps / press-and-hold
    advancedAzoteq: boolean    // bottom-beta, stationary-threshold, flip-x/y, switch-xy
    snipe: boolean
    scrollLayer: boolean       // xy->scroll on a held layer (listener child node)
  }
}

export const POINTING_DEVICES: PointingDevice[] = [
  {
    keyboardId: 'corne',
    keyboardName: 'Corne',
    deviceName: 'Trackpad',
    chip: 'Azoteq IQS5XX',
    overlayPath:
      '/Users/tomkwon/Documents/cross_keyboard/config/boards/shields/corne_tp/corne_tp_right.overlay',
    sensorNodeRe: 'trackpad\\s*:\\s*iqs5xx@74\\s*\\{',
    listenerNodeRe: 'trackpad_listener\\s*\\{',
    supports: {
      cursorScaler: true,
      // Azoteq binding has no sensitivity prop (that was the old Cirque chip)
      chipSensitivity: false,
      cpi: false,
      invertXY: false,
      smartMode: false,
      scrollToggles: true,
      gestures: true,
      advancedAzoteq: true,
      snipe: true,
      scrollLayer: false,
    },
  },
  {
    keyboardId: 'crosses',
    keyboardName: 'Crosses',
    deviceName: 'Trackball',
    chip: 'Pixart PMW3610',
    overlayPath:
      '/Users/tomkwon/Documents/cross_keyboard-crosses/config/boards/shields/crosses/crosses_right.overlay',
    sensorNodeRe: 'trackball\\s*:\\s*trackball@0\\s*\\{',
    listenerNodeRe: 'trackball_listener\\s*\\{',
    supports: {
      cursorScaler: true,
      chipSensitivity: false,
      cpi: true,
      invertXY: true,
      smartMode: true,
      scrollToggles: false,
      gestures: false,
      advancedAzoteq: false,
      snipe: true,
      scrollLayer: true,
    },
  },
]
