import { useState, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import { KEY_CODES, MODIFIER_NAMES, SimpleRemapRule, ComboRule } from '../../lib/karabinerGenerator';
import { useKarabinerStore } from '../../stores/karabinerStore';

// ── Modifier checkboxes helper ────────────────────────────────────────────────

function ModifierPicker({
  label,
  selected,
  onChange,
}: {
  label: string;
  selected: string[];
  onChange: (mods: string[]) => void;
}) {
  const toggle = (mod: string) => {
    if (selected.includes(mod)) {
      onChange(selected.filter((m) => m !== mod));
    } else {
      onChange([...selected, mod]);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 32 }}>{label}</span>
      {MODIFIER_NAMES.map((mod) => (
        <label
          key={mod}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            fontSize: 12,
            color: selected.includes(mod) ? 'var(--accent)' : 'var(--text-muted)',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={selected.includes(mod)}
            onChange={() => toggle(mod)}
            style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          {mod}
        </label>
      ))}
    </div>
  );
}

// ── Key selector ──────────────────────────────────────────────────────────────

function KeySelect({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (k: string) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ flex: 1, height: 32, fontSize: 13 }}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {KEY_CODES.map((k) => (
        <option key={k} value={k}>
          {k}
        </option>
      ))}
    </select>
  );
}

// ── Letter grid for combo picker ──────────────────────────────────────────────

const LETTER_KEYS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const SPECIAL_COMBO_KEYS = ['return_or_enter', 'escape', 'spacebar', 'tab'];

function ComboKeyPicker({
  selected,
  onAdd,
}: {
  selected: string[];
  onAdd: (k: string) => void;
}) {
  return (
    <div>
      {/* Letter grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(13, 1fr)',
          gap: 4,
          marginBottom: 8,
        }}
      >
        {LETTER_KEYS.map((k) => {
          const active = selected.includes(k);
          return (
            <button
              key={k}
              onClick={() => !active && onAdd(k)}
              disabled={active}
              style={{
                height: 30,
                borderRadius: 5,
                fontSize: 12,
                fontWeight: 600,
                background: active ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: active ? '#fff' : 'var(--text)',
                border: '1px solid var(--border)',
                transition: 'background 0.1s',
                cursor: active ? 'default' : 'pointer',
                opacity: active ? 0.7 : 1,
              }}
              title={active ? 'Already in combo' : `Add ${k}`}
            >
              {k}
            </button>
          );
        })}
      </div>

      {/* Special keys */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SPECIAL_COMBO_KEYS.map((k) => {
          const active = selected.includes(k);
          const label =
            k === 'return_or_enter' ? 'enter' :
            k === 'escape' ? 'esc' :
            k === 'spacebar' ? 'space' : k;
          return (
            <button
              key={k}
              onClick={() => !active && onAdd(k)}
              disabled={active}
              style={{
                padding: '4px 10px',
                borderRadius: 5,
                fontSize: 12,
                background: active ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: active ? '#fff' : 'var(--text)',
                border: '1px solid var(--border)',
                cursor: active ? 'default' : 'pointer',
                opacity: active ? 0.7 : 1,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Chip row ──────────────────────────────────────────────────────────────────

function ChipRow({
  keys,
  onRemove,
}: {
  keys: string[];
  onRemove: (k: string) => void;
}) {
  if (keys.length === 0) {
    return (
      <span style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
        Click keys below to add them to the combo
      </span>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {keys.map((k) => (
        <span
          key={k}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            background: 'var(--accent)',
            color: '#fff',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {k}
          <button
            onClick={() => onRemove(k)}
            style={{ color: '#fff', opacity: 0.75, lineHeight: 1, padding: 0 }}
            title={`Remove ${k}`}
          >
            <X size={11} />
          </button>
        </span>
      ))}
    </div>
  );
}

// ── Remap Key tab ─────────────────────────────────────────────────────────────

function RemapTab({ prefilledFromKey }: { prefilledFromKey?: string }) {
  const addRule = useKarabinerStore((s) => s.addRule);
  const [fromKey, setFromKey] = useState(prefilledFromKey ?? KEY_CODES[0]);
  const [fromMods, setFromMods] = useState<string[]>([]);
  const [toKey, setToKey] = useState(KEY_CODES[0]);
  // Sync when user clicks a different key on the keyboard
  if (prefilledFromKey && prefilledFromKey !== fromKey) setFromKey(prefilledFromKey);
  const [toMods, setToMods] = useState<string[]>([]);
  const [desc, setDesc] = useState('');

  const handleAdd = useCallback(() => {
    const rule: SimpleRemapRule = {
      type: 'simple',
      description: desc.trim() || `${fromKey} → ${toKey}`,
      fromKey,
      fromModifiers: fromMods.length > 0 ? fromMods : undefined,
      toKey,
      toModifiers: toMods.length > 0 ? toMods : undefined,
    };
    addRule(rule);
    setDesc('');
    setFromMods([]);
    setToMods([]);
  }, [addRule, fromKey, fromMods, toKey, toMods, desc]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* From row */}
      <div
        style={{
          background: 'var(--bg-tertiary)',
          borderRadius: 8,
          padding: 12,
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
          From
        </span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 28 }}>Key</span>
          <KeySelect value={fromKey} onChange={setFromKey} />
        </div>
        <ModifierPicker label="Mods" selected={fromMods} onChange={setFromMods} />
      </div>

      {/* Arrow indicator */}
      <div style={{ textAlign: 'center', color: 'var(--accent)', fontSize: 18, lineHeight: 1 }}>→</div>

      {/* To row */}
      <div
        style={{
          background: 'var(--bg-tertiary)',
          borderRadius: 8,
          padding: 12,
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
          To
        </span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 28 }}>Key</span>
          <KeySelect value={toKey} onChange={setToKey} />
        </div>
        <ModifierPicker label="Mods" selected={toMods} onChange={setToMods} />
      </div>

      {/* Description */}
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder={`Description (e.g. "${fromKey} → ${toKey}")`}
        style={{ width: '100%', height: 34 }}
      />

      {/* Add button */}
      <button className="btn btn-primary" onClick={handleAdd} style={{ alignSelf: 'flex-end' }}>
        <Plus size={14} />
        Add Rule
      </button>
    </div>
  );
}

// ── Combo Keys tab ─────────────────────────────────────────────────────────────

function ComboTab() {
  const addRule = useKarabinerStore((s) => s.addRule);
  const [fromKeys, setFromKeys] = useState<string[]>([]);
  const [toKey, setToKey] = useState(KEY_CODES[0]);
  const [toMods, setToMods] = useState<string[]>([]);
  const [desc, setDesc] = useState('');

  const addFromKey = useCallback((k: string) => {
    setFromKeys((prev) => (prev.includes(k) ? prev : [...prev, k]));
  }, []);

  const removeFromKey = useCallback((k: string) => {
    setFromKeys((prev) => prev.filter((x) => x !== k));
  }, []);

  const handleAdd = useCallback(() => {
    if (fromKeys.length < 2) {
      alert('A combo requires at least 2 keys.');
      return;
    }
    const rule: ComboRule = {
      type: 'combo',
      description: desc.trim() || `${fromKeys.join('+')} → ${toKey}`,
      fromKeys,
      toKey,
      toModifiers: toMods.length > 0 ? toMods : undefined,
    };
    addRule(rule);
    setFromKeys([]);
    setDesc('');
    setToMods([]);
  }, [addRule, fromKeys, toKey, toMods, desc]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* From combo keys */}
      <div
        style={{
          background: 'var(--bg-tertiary)',
          borderRadius: 8,
          padding: 12,
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
          From Keys (simultaneous)
        </span>
        <div style={{ minHeight: 28 }}>
          <ChipRow keys={fromKeys} onRemove={removeFromKey} />
        </div>
        <ComboKeyPicker selected={fromKeys} onAdd={addFromKey} />
      </div>

      {/* Arrow */}
      <div style={{ textAlign: 'center', color: 'var(--accent)', fontSize: 18, lineHeight: 1 }}>→</div>

      {/* To row */}
      <div
        style={{
          background: 'var(--bg-tertiary)',
          borderRadius: 8,
          padding: 12,
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
          To
        </span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 28 }}>Key</span>
          <KeySelect value={toKey} onChange={setToKey} />
        </div>
        <ModifierPicker label="Mods" selected={toMods} onChange={setToMods} />
      </div>

      {/* Description */}
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder={
          fromKeys.length >= 2
            ? `Description (e.g. "${fromKeys.join('+')} → ${toKey}")`
            : 'Description…'
        }
        style={{ width: '100%', height: 34 }}
      />

      {/* Add button */}
      <button
        className="btn btn-primary"
        onClick={handleAdd}
        disabled={fromKeys.length < 2}
        style={{ alignSelf: 'flex-end' }}
        title={fromKeys.length < 2 ? 'Select at least 2 keys' : undefined}
      >
        <Plus size={14} />
        Add Combo
      </button>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function RuleEditor({ prefilledFromKey }: { prefilledFromKey?: string }) {
  const [activeTab, setActiveTab] = useState<'remap' | 'combo'>('remap');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg)',
      }}
    >
      {/* Tab bar header */}
      <div
        style={{
          padding: '12px 16px 0',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}
      >
        <div className="tab-bar" style={{ display: 'inline-flex' }}>
          <button
            className={`tab-btn${activeTab === 'remap' ? ' active' : ''}`}
            onClick={() => setActiveTab('remap')}
          >
            Remap Key
          </button>
          <button
            className={`tab-btn${activeTab === 'combo' ? ' active' : ''}`}
            onClick={() => setActiveTab('combo')}
          >
            Combo Keys
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
        }}
      >
        {activeTab === 'remap' ? <RemapTab prefilledFromKey={prefilledFromKey} /> : <ComboTab />}
      </div>
    </div>
  );
}
