/**
 * "Add pointing device" templates. Each template is a *tested tuple*
 * (controller × sensor × bus × ZMK revision) reproduced from a config that
 * builds green on GitHub Actions. Anything outside the list is presented as
 * an editable preview labelled untested, never as a guaranteed build.
 *
 * Every generated block is wrapped in marker comments so the same device can
 * be removed exactly later.
 */
import type { PointingDescriptor } from '@/lib/registry/types'

export interface PinField {
  key: string
  label: string
  hint?: string
  /** default value from the tested config */
  value: string
  /** validation: gpio = "<port> <pin>", psel = "<port> <pin>", int = number */
  kind: 'gpio' | 'psel' | 'int'
}

export interface PointingTemplate {
  id: string
  name: string
  chip: string
  compatible: string
  bus: 'spi' | 'i2c'
  tested: { controller: string; zmk: string; source: string } | null
  fields: PinField[]
  /** lines for the central half's .conf */
  conf: string[]
  /** west.yml module, when the driver is not in-tree */
  west?: { remoteName: string; urlBase: string; project: string; revision: string }
  /** overlay text; `{{key}}` placeholders from fields */
  overlay: string
  /** the descriptor to register after applying */
  descriptor: (id: string) => Omit<PointingDescriptor, 'overlayPath'>
}

export const MARK = (id: string, edge: 'begin' | 'end') => `// uk:pointing:${id}:${edge}`

const PMW3610_SUPPORTS = { cursorScaler: true, chipSensitivity: false, cpi: true, invertXY: true, smartMode: true, scrollToggles: false, gestures: false, advancedAzoteq: false, snipe: true, scrollLayer: true }
const AZOTEQ_SUPPORTS = { cursorScaler: true, chipSensitivity: false, cpi: false, invertXY: false, smartMode: false, scrollToggles: true, gestures: true, advancedAzoteq: true, snipe: true, scrollLayer: true }
const CIRQUE_SUPPORTS = { cursorScaler: true, chipSensitivity: true, cpi: false, invertXY: true, smartMode: false, scrollToggles: false, gestures: false, advancedAzoteq: false, snipe: true, scrollLayer: true }

export const TEMPLATES: PointingTemplate[] = [
  {
    id: 'pmw3610-spi',
    name: 'Trackball — Pixart PMW3610 (SPI)',
    chip: 'Pixart PMW3610',
    compatible: 'pixart,pmw3610',
    bus: 'spi',
    tested: { controller: 'nice!nano v2', zmk: 'zmkfirmware/zmk main (in-tree driver)', source: 'Crosses trackball, builds green 2026-09' },
    fields: [
      { key: 'sck', label: 'SCK', hint: 'SPI clock, "port pin"', value: '0 17', kind: 'psel' },
      { key: 'mosi', label: 'MOSI', hint: '"port pin"', value: '0 20', kind: 'psel' },
      { key: 'miso', label: 'MISO', hint: '"port pin" (may equal MOSI on 3-wire boards)', value: '0 20', kind: 'psel' },
      { key: 'cs', label: 'CS', hint: 'chip-select gpio "port pin"', value: '1 0', kind: 'gpio' },
      { key: 'motion', label: 'MOTION', hint: 'motion interrupt gpio "port pin"', value: '0 6', kind: 'gpio' },
      { key: 'cpi', label: 'CPI', value: '1100', kind: 'int' },
    ],
    conf: ['CONFIG_SPI=y', 'CONFIG_INPUT=y', 'CONFIG_ZMK_POINTING=y', 'CONFIG_ZMK_MOUSE=y', 'CONFIG_INPUT_PMW3610=y'],
    overlay: `#include <zephyr/dt-bindings/input/input-event-codes.h>

// trackball bus
&pinctrl {
    spi0_default: spi0_default {
        group1 {
            psels = <NRF_PSEL(SPIM_SCK, {{sck}})>,
                <NRF_PSEL(SPIM_MOSI, {{mosi}})>,
                <NRF_PSEL(SPIM_MISO, {{miso}})>;
        };
    };

    spi0_sleep: spi0_sleep {
        group1 {
            psels = <NRF_PSEL(SPIM_SCK, {{sck}})>,
                <NRF_PSEL(SPIM_MOSI, {{mosi}})>,
                <NRF_PSEL(SPIM_MISO, {{miso}})>;
            low-power-enable;
        };
    };
};

&spi0 {
    status = "okay";
    compatible = "nordic,nrf-spim";
    pinctrl-0 = <&spi0_default>;
    pinctrl-1 = <&spi0_sleep>;
    pinctrl-names = "default", "sleep";
    cs-gpios = <&gpio{{cs}} GPIO_ACTIVE_LOW>;

    trackball: trackball@0 {
        status = "okay";
        compatible = "pixart,pmw3610";
        reg = <0>;
        spi-max-frequency = <2000000>;
        motion-gpios = <&gpio{{motion}} (GPIO_ACTIVE_LOW | GPIO_PULL_UP)>;
        zephyr,axis-x = <INPUT_REL_X>;
        zephyr,axis-y = <INPUT_REL_Y>;
        res-cpi = <{{cpi}}>;
    };
};

#include <input/processors.dtsi>

/ {
    trackball_listener {
        compatible = "zmk,input-listener";
        device = <&trackball>;
        input-processors = <&zip_xy_scaler 1 1>;
    };
};`,
    descriptor: (id) => ({ id, name: 'Trackball', chip: 'Pixart PMW3610', compatible: 'pixart,pmw3610', sensorNodeRe: 'trackball\\s*:\\s*trackball@0\\s*\\{', listenerNodeRe: 'trackball_listener\\s*\\{', supports: PMW3610_SUPPORTS }),
  },
  {
    id: 'azoteq-i2c',
    name: 'Trackpad — Azoteq IQS5XX (I²C)',
    chip: 'Azoteq IQS5XX',
    compatible: 'azoteq,iqs5xx',
    bus: 'i2c',
    tested: { controller: 'nice!nano v2', zmk: 'zmkfirmware/zmk main + AYM1607/zmk-driver-azoteq-iqs5xx main', source: 'Corne trackpad, builds green 2026-09' },
    fields: [
      { key: 'rdy', label: 'RDY', hint: 'data-ready gpio "port pin"', value: '1 2', kind: 'gpio' },
      { key: 'reset', label: 'RESET', hint: 'reset gpio "port pin"', value: '1 1', kind: 'gpio' },
    ],
    conf: ['CONFIG_I2C=y', 'CONFIG_GPIO=y', 'CONFIG_PINCTRL=y', 'CONFIG_INPUT=y', 'CONFIG_ZMK_POINTING=y', 'CONFIG_ZMK_MOUSE=y', 'CONFIG_INPUT_AZOTEQ_IQS5XX=y'],
    west: { remoteName: 'aym1607', urlBase: 'https://github.com/AYM1607', project: 'zmk-driver-azoteq-iqs5xx', revision: 'main' },
    overlay: `&pro_micro_i2c {
    status = "okay";

    trackpad: iqs5xx@74 {
        compatible = "azoteq,iqs5xx";
        reg = <0x74>;
        status = "okay";

        rdy-gpios   = <&gpio{{rdy}} GPIO_ACTIVE_HIGH>;
        reset-gpios = <&gpio{{reset}} GPIO_ACTIVE_LOW>;

        one-finger-tap;
        press-and-hold;
        press-and-hold-time = <250>;
        two-finger-tap;

        scroll;
        natural-scroll-y;
        natural-scroll-x;

        bottom-beta = <5>;
        stationary-threshold = <5>;
    };
};

#include <input/processors.dtsi>

/ {
    trackpad_listener {
        compatible = "zmk,input-listener";
        device = <&trackpad>;
        input-processors = <&zip_xy_scaler 1 1>;
    };
};`,
    descriptor: (id) => ({ id, name: 'Trackpad', chip: 'Azoteq IQS5XX', compatible: 'azoteq,iqs5xx', sensorNodeRe: 'trackpad\\s*:\\s*iqs5xx@74\\s*\\{', listenerNodeRe: 'trackpad_listener\\s*\\{', supports: AZOTEQ_SUPPORTS }),
  },
  {
    id: 'cirque-spi',
    name: 'Trackpad — Cirque Pinnacle (SPI) — untested',
    chip: 'Cirque Pinnacle',
    compatible: 'cirque,pinnacle',
    bus: 'spi',
    tested: null,
    fields: [
      { key: 'sck', label: 'SCK', value: '0 17', kind: 'psel' },
      { key: 'mosi', label: 'MOSI', value: '0 20', kind: 'psel' },
      { key: 'miso', label: 'MISO', value: '0 22', kind: 'psel' },
      { key: 'cs', label: 'CS', value: '1 0', kind: 'gpio' },
      { key: 'dr', label: 'DR', hint: 'data-ready gpio "port pin"', value: '0 6', kind: 'gpio' },
    ],
    conf: ['CONFIG_SPI=y', 'CONFIG_INPUT=y', 'CONFIG_ZMK_POINTING=y', 'CONFIG_ZMK_MOUSE=y', 'CONFIG_INPUT_PINNACLE=y'],
    west: { remoteName: 'petejohanson', urlBase: 'https://github.com/petejohanson', project: 'cirque-input-module', revision: 'main' },
    overlay: `&pinctrl {
    spi0_default: spi0_default {
        group1 {
            psels = <NRF_PSEL(SPIM_SCK, {{sck}})>,
                <NRF_PSEL(SPIM_MOSI, {{mosi}})>,
                <NRF_PSEL(SPIM_MISO, {{miso}})>;
        };
    };
    spi0_sleep: spi0_sleep {
        group1 {
            psels = <NRF_PSEL(SPIM_SCK, {{sck}})>,
                <NRF_PSEL(SPIM_MOSI, {{mosi}})>,
                <NRF_PSEL(SPIM_MISO, {{miso}})>;
            low-power-enable;
        };
    };
};

&spi0 {
    status = "okay";
    compatible = "nordic,nrf-spim";
    pinctrl-0 = <&spi0_default>;
    pinctrl-1 = <&spi0_sleep>;
    pinctrl-names = "default", "sleep";
    cs-gpios = <&gpio{{cs}} GPIO_ACTIVE_LOW>;

    glidepoint: glidepoint@0 {
        compatible = "cirque,pinnacle";
        reg = <0>;
        spi-max-frequency = <1000000>;
        status = "okay";
        dr-gpios = <&gpio{{dr}} (GPIO_ACTIVE_HIGH)>;
        sensitivity = "2x";
        sleep;
        no-taps;
    };
};

#include <input/processors.dtsi>

/ {
    glidepoint_listener {
        compatible = "zmk,input-listener";
        device = <&glidepoint>;
        input-processors = <&zip_xy_scaler 1 1>;
    };
};`,
    descriptor: (id) => ({ id, name: 'Trackpad', chip: 'Cirque Pinnacle', compatible: 'cirque,pinnacle', sensorNodeRe: 'glidepoint\\s*:\\s*glidepoint@0\\s*\\{', listenerNodeRe: 'glidepoint_listener\\s*\\{', supports: CIRQUE_SUPPORTS }),
  },
]

export function validateField(f: PinField, value: string): string | null {
  const v = value.trim()
  if (f.kind === 'int') return /^\d+$/.test(v) ? null : 'whole number'
  const m = /^([01])\s+(\d{1,2})$/.exec(v)
  if (!m) return 'expected "port pin", e.g. 0 17'
  const pin = parseInt(m[2], 10)
  if (pin > 31) return 'pin must be 0–31'
  return null
}

/** Fill the template placeholders and wrap in markers. */
export function renderOverlay(t: PointingTemplate, values: Record<string, string>, id: string): string {
  let text = t.overlay
  for (const f of t.fields) {
    const v = (values[f.key] ?? f.value).trim()
    // psel macros take `port, pin`; gpio phandles take `&gpio<port> <pin>`
    const rendered = f.kind === 'int' ? v : f.kind === 'psel' ? v.replace(/\s+/, ', ') : v.replace(/\s+/, ' ')
    text = text.split(`{{${f.key}}}`).join(rendered)
  }
  // gpio placeholders are "port pin" but we emit `&gpio<port> <pin>`
  text = text.replace(/&gpio([01]) (\d+)/g, '&gpio$1 $2')
  return `\n${MARK(id, 'begin')}\n${text}\n${MARK(id, 'end')}\n`
}

export function renderConf(t: PointingTemplate, id: string): string {
  return `\n${MARK(id, 'begin').replace('//', '#')}\n${t.conf.join('\n')}\n${MARK(id, 'end').replace('//', '#')}\n`
}
