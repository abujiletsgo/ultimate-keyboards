import { ArrowRight, Zap, Trash2 } from 'lucide-react';
import { useKarabinerStore } from '../../stores/karabinerStore';
import type { Rule, SimpleRemapRule, ComboRule } from '../../lib/karabinerGenerator';

function getRuleSummary(rule: Rule): string {
  if (rule.type === 'simple') {
    const r = rule as SimpleRemapRule;
    const fromMods = r.fromModifiers && r.fromModifiers.length > 0
      ? `${r.fromModifiers.join('+')}+`
      : '';
    const toMods = r.toModifiers && r.toModifiers.length > 0
      ? `${r.toModifiers.join('+')}+`
      : '';
    return `${fromMods}${r.fromKey} → ${toMods}${r.toKey}`;
  }
  // combo
  const r = rule as ComboRule;
  const toMods = r.toModifiers && r.toModifiers.length > 0
    ? `${r.toModifiers.join('+')}+`
    : '';
  return `${r.fromKeys.join('+')} → ${toMods}${r.toKey}`;
}

export function RuleList() {
  const { rules, removeRule } = useKarabinerStore();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
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
              color: 'var(--text-muted)',
              padding: 24,
              textAlign: 'center',
            }}
          >
            <ArrowRight size={32} strokeWidth={1.5} style={{ opacity: 0.4 }} />
            <p style={{ fontSize: 13, lineHeight: 1.6 }}>
              No rules yet. Create your first key rebinding →
            </p>
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
  const isCombo = rule.type === 'combo';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLDivElement).style.background = 'var(--bg-secondary)')
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLDivElement).style.background = 'var(--bg)')
      }
    >
      {/* Icon */}
      <div
        style={{
          flexShrink: 0,
          color: isCombo ? '#f59e0b' : 'var(--accent)',
          display: 'flex',
        }}
      >
        {isCombo ? <Zap size={16} /> : <ArrowRight size={16} />}
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
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginTop: 2,
          }}
          title={summary}
        >
          {summary}
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(idx)}
        style={{
          flexShrink: 0,
          padding: 5,
          borderRadius: 6,
          color: 'var(--text-muted)',
          transition: 'color 0.15s, background 0.15s',
          display: 'flex',
          alignItems: 'center',
        }}
        title="Delete rule"
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)';
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(224,90,90,0.1)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
