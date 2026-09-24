import { ArrowRight, Zap, Layers, Command, Trash2 } from 'lucide-react';
import { useKarabinerStore } from '../../stores/karabinerStore';
import type { Rule } from '../../lib/karabinerGenerator';

function joinMods(mods?: string[]): string {
  return mods && mods.length > 0 ? `${mods.join('+')}+` : '';
}

function getRuleSummary(rule: Rule): string {
  switch (rule.type) {
    case 'simple':
      return `${joinMods(rule.fromModifiers)}${rule.fromKey} → ${joinMods(rule.toModifiers)}${rule.toKey}`;
    case 'combo':
      return `${rule.fromKeys.join('+')} → ${joinMods(rule.toModifiers)}${rule.toKey}`;
    case 'layer_activator':
      return `hold ${rule.fromKey} → ${rule.layerName}${rule.tapKey ? ` · tap → ${rule.tapKey}` : ''}`;
    case 'layer_binding':
      return `${rule.layerName}: ${rule.fromKey} → ${joinMods(rule.toModifiers)}${rule.toKey}`;
    case 'homerow_mod':
      return `${rule.fromKey}: tap → ${rule.tapKey} · hold → ${rule.modKey}`;
  }
}

/** Per-rule-type presentation: icon, tag label, and tint */
function getRuleKind(rule: Rule): { label: string; icon: 'arrow' | 'zap' | 'layers' | 'command'; tint: 'accent' | 'warning' | 'blue' | 'pink' } {
  switch (rule.type) {
    case 'simple':          return { label: 'remap', icon: 'arrow', tint: 'accent' };
    case 'combo':           return { label: 'combo', icon: 'zap', tint: 'warning' };
    case 'layer_activator': return { label: 'layer', icon: 'layers', tint: 'blue' };
    case 'layer_binding':   return { label: 'layer key', icon: 'layers', tint: 'blue' };
    case 'homerow_mod':     return { label: 'homerow', icon: 'command', tint: 'pink' };
  }
}

export function RuleList() {
  const { rules, removeRule } = useKarabinerStore();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="section-header">
        <span className="section-title">
          {rules.length} {rules.length === 1 ? 'rule' : 'rules'} configured
        </span>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {rules.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 10,
              padding: 24,
              textAlign: 'center',
            }}
          >
            <ArrowRight size={32} strokeWidth={1.5} style={{ opacity: 0.4, color: 'var(--text-muted)' }} />
            <p className="panel-inset" style={{ margin: 0, padding: '10px 16px', fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>
              No rules yet. Create your first key rebinding →
            </p>
            <button className="btn btn-secondary btn-sm" onClick={() => useKarabinerStore.getState().loadExample()}>
              Load example profile
            </button>
          </div>
        ) : (
          rules.map((rule, idx) => (
            <RuleItem key={idx} rule={rule} idx={idx} onDelete={removeRule} />
          ))
        )}
      </div>
    </div>
  );
}

function RuleItem({
  rule,
  idx,
  onDelete,
}: {
  rule: Rule;
  idx: number;
  onDelete: (idx: number) => void;
}) {
  const summary = getRuleSummary(rule);
  const kind = getRuleKind(rule);
  const tintColor = {
    accent: 'var(--accent)',
    warning: 'var(--warning)',
    blue: 'var(--accent-2)',
    pink: '#f9a8d4',
  }[kind.tint];
  const tagStyle = {
    accent: undefined,
    warning: { background: 'rgba(251,191,36,0.14)', borderColor: 'rgba(251,191,36,0.25)', color: 'var(--warning)' },
    blue: { background: 'rgba(94,166,255,0.14)', borderColor: 'rgba(94,166,255,0.25)', color: 'var(--accent-2)' },
    pink: { background: 'rgba(244,114,182,0.14)', borderColor: 'rgba(244,114,182,0.25)', color: '#f9a8d4' },
  }[kind.tint];

  return (
    <div className="list-row" style={{ height: 'auto', minHeight: 54, padding: '10px 14px', gap: 10 }}>
      {/* Icon */}
      <div
        style={{
          flexShrink: 0,
          color: tintColor,
          display: 'flex',
        }}
      >
        {kind.icon === 'zap' ? <Zap size={16} />
          : kind.icon === 'layers' ? <Layers size={16} />
          : kind.icon === 'command' ? <Command size={16} />
          : <ArrowRight size={16} />}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={rule.description}
        >
          {rule.description}
        </div>
        <div
          className="mono"
          style={{
            marginTop: 2,
            display: 'inline-block',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            verticalAlign: 'top',
          }}
          title={summary}
        >
          {summary}
        </div>
      </div>

      {/* Type tag */}
      <span
        className={`tag${kind.tint === 'accent' ? ' tag-accent' : ''}`}
        style={tagStyle}
      >
        {kind.label}
      </span>

      {/* Delete */}
      <button
        className="btn btn-danger btn-sm"
        onClick={() => {
          if (window.confirm(`Delete rule "${rule.description}"?`)) onDelete(idx);
        }}
        title="Delete rule"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
