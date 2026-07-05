import React, { type CSSProperties } from 'react';

interface LayerGridProps {
  keys: string[];
  highlighted?: Set<number>;
  onKeyClick?: (pos: number) => void;
}

const KEY_SIZE = 44;
const GAP = 4;

// Layout: 3 rows of 12 (positions 0–35) + 6 thumb keys (positions 36–41, centered)
const ROW_COUNT = 3;
const COLS = 12;
const THUMB_COUNT = 6;

function abbreviate(binding: string): string {
  // Strip leading &
  const s = binding.replace(/^&/, '');
  // Common abbreviations
  if (s === 'trans') return '___';
  if (s === 'none') return 'XXX';
  // &kp KEY → KEY (possibly truncated)
  const kpMatch = s.match(/^kp\s+(.+)$/);
  if (kpMatch) {
    const key = kpMatch[1];
    // Single char keys
    if (/^[A-Z0-9]$/.test(key)) return key;
    // Map common names
    const abbrevMap: Record<string, string> = {
      SPACE: 'SPC', ENTER: 'ENT', RETURN: 'ENT', BACKSPACE: 'BSPC',
      ESCAPE: 'ESC', DELETE: 'DEL', TAB: 'TAB', CAPSLOCK: 'CAPS',
      LEFT_SHIFT: 'LSFT', RIGHT_SHIFT: 'RSFT',
      LEFT_CONTROL: 'LCTL', RIGHT_CONTROL: 'RCTL',
      LEFT_ALT: 'LALT', RIGHT_ALT: 'RALT',
      LEFT_COMMAND: 'LCMD', RIGHT_COMMAND: 'RCMD',
      LEFT_ARROW: '←', RIGHT_ARROW: '→', UP_ARROW: '↑', DOWN_ARROW: '↓',
      SEMI: ';', SQT: "'", COMMA: ',', DOT: '.', FSLH: '/', BSLH: '\\',
      MINUS: '-', PLUS: '+', EQUAL: '=', GRAVE: '`', TILDE: '~',
      LEFT_BRACKET: '[', RIGHT_BRACKET: ']',
      NUMBER_1: '1', NUMBER_2: '2', NUMBER_3: '3', NUMBER_4: '4',
      NUMBER_5: '5', NUMBER_6: '6', NUMBER_7: '7', NUMBER_8: '8',
      NUMBER_9: '9', NUMBER_0: '0',
      N0: '0', N1: '1', N2: '2', N3: '3', N4: '4',
      N5: '5', N6: '6', N7: '7', N8: '8', N9: '9',
    };
    return abbrevMap[key] ?? key.slice(0, 4);
  }
  // &mo N → mo(N)
  const moMatch = s.match(/^mo\s+(\d+)$/);
  if (moMatch) return `mo${moMatch[1]}`;
  // &lt N KEY → ltN
  const ltMatch = s.match(/^lt\s+(\d+)\s+/);
  if (ltMatch) return `lt${ltMatch[1]}`;
  // &mt MOD KEY → mt
  const mtMatch = s.match(/^mt\s+/);
  if (mtMatch) return 'mt';
  // &tog N
  const togMatch = s.match(/^tog\s+(\d+)$/);
  if (togMatch) return `tg${togMatch[1]}`;
  // Fallback: first 4 chars
  return s.slice(0, 4);
}

export const LayerGrid: React.FC<LayerGridProps> = ({
  keys,
  highlighted = new Set(),
  onKeyClick,
}) => {
  const totalWidth = COLS * KEY_SIZE + (COLS - 1) * GAP;
  const thumbWidth = THUMB_COUNT * KEY_SIZE + (THUMB_COUNT - 1) * GAP;
  const thumbOffset = Math.floor((totalWidth - thumbWidth) / 2);

  const renderKey = (pos: number) => {
    const label = keys[pos] ?? '';
    const isHighlighted = highlighted.has(pos);
    const clickable = !!onKeyClick;

    return (
      <div
        key={pos}
        title={label}
        onClick={() => onKeyClick?.(pos)}
        className={`keycap${isHighlighted ? ' selected' : ''}`}
        style={{
          width: KEY_SIZE,
          height: KEY_SIZE,
          fontSize: 10,
          cursor: clickable ? 'pointer' : 'default',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        } as CSSProperties}
      >
        {abbreviate(label)}
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: GAP,
        userSelect: 'none',
        fontFamily: 'monospace',
      }}
    >
      {/* Main rows: 3 rows × 12 cols */}
      {Array.from({ length: ROW_COUNT }, (_, row) => (
        <div key={row} style={{ display: 'flex', gap: GAP }}>
          {Array.from({ length: COLS }, (_, col) => {
            const pos = row * COLS + col;
            return renderKey(pos);
          })}
        </div>
      ))}

      {/* Thumb row: 6 keys, centered */}
      <div
        style={{
          display: 'flex',
          gap: GAP,
          marginLeft: thumbOffset,
        }}
      >
        {Array.from({ length: THUMB_COUNT }, (_, i) => {
          const pos = ROW_COUNT * COLS + i; // 36–41
          return renderKey(pos);
        })}
      </div>
    </div>
  );
};

export default LayerGrid;
