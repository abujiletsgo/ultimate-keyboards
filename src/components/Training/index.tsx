import { useState } from 'react'
import { useTrainingStore } from '../../stores/trainingStore'
import CalibrateTab from './CalibrateTab'
import PracticeTab from './PracticeTab'
import TestTab from './TestTab'

type Tab = 'practice' | 'calibrate' | 'test'

const TAB_LABELS: { id: Tab; label: string }[] = [
  { id: 'practice', label: 'Practice' },
  { id: 'calibrate', label: 'Calibrate' },
  { id: 'test', label: 'Test' },
]

export default function TrainingView() {
  const [activeTab, setActiveTab] = useState<Tab>('practice')
  const { chordWindowMs, setChordWindow } = useTrainingStore()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        {/* Tab buttons */}
        <div className="seg-ctrl">
          {TAB_LABELS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`seg-btn${activeTab === id ? ' active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Chord window slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            Chord Window:
          </span>
          <input
            type="range"
            min={20}
            max={150}
            step={5}
            value={chordWindowMs}
            onChange={(e) => setChordWindow(Number(e.target.value))}
            style={{
              width: '120px',
              accentColor: 'var(--accent)',
              cursor: 'pointer',
            }}
          />
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--accent)',
              fontFamily: 'monospace',
              minWidth: '44px',
            }}
          >
            {chordWindowMs}ms
          </span>
        </div>
      </div>

      {/* Tab content */}
      <div
        key={activeTab}
        className="glass anim-fade-up"
        style={{
          flex: 1,
          overflow: 'auto',
          margin: '20px 24px',
          padding: '28px 32px',
        }}
      >
        {activeTab === 'practice' && <PracticeTab />}
        {activeTab === 'calibrate' && <CalibrateTab />}
        {activeTab === 'test' && <TestTab />}
      </div>
    </div>
  )
}
