'use client';

import { useState } from 'react';
import { KNOWLEDGE_TABS } from '@/lib/knowledge/patterns';
import KnowledgeChart from '@/components/KnowledgeChart';

export default function KnowledgePage() {
  const [tabId, setTabId] = useState(KNOWLEDGE_TABS[0].id);
  const tab = KNOWLEDGE_TABS.find(t => t.id === tabId) ?? KNOWLEDGE_TABS[0];
  const [patternId, setPatternId] = useState(tab.patterns[0].id);
  const pattern = tab.patterns.find(p => p.id === patternId) ?? tab.patterns[0];

  function selectTab(id: string) {
    setTabId(id);
    const newTab = KNOWLEDGE_TABS.find(t => t.id === id);
    if (newTab) setPatternId(newTab.patterns[0].id);
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-[18px] font-bold text-white">Knowledge Base</h1>
        <p className="text-[12px] text-white/35 mt-0.5">
          Pattern ตัวอย่างของแต่ละ scan — ข้อมูลจำลอง ไม่ใช่ราคาจริง
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 md:overflow-visible md:flex-wrap">
        {KNOWLEDGE_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => selectTab(t.id)}
            className={`px-4 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
              tabId === t.id ? 'bg-white/10 text-white' : 'bg-white/[0.03] text-white/40 hover:text-white/70'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-[12px] text-white/30 leading-relaxed max-w-3xl">{tab.intro}</p>

      {/* Pattern pills */}
      <div className="flex flex-wrap gap-1.5">
        {tab.patterns.map(p => (
          <button
            key={p.id}
            onClick={() => setPatternId(p.id)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
              patternId === p.id ? 'bg-[#7F77DD] text-white' : 'bg-white/[0.04] text-white/40 hover:text-white/70'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Chart (left) + criteria card (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">
        <KnowledgeChart shape={pattern.shape} markers={pattern.markers} />

        <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5 space-y-5">
          <div>
            <h2 className="text-[14px] font-bold text-white mb-1.5">{pattern.name}</h2>
            <p className="text-[12.5px] text-white/50 leading-relaxed">{pattern.description}</p>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/30 mb-2">
              Scan มองหาอะไร
            </h3>
            <ul className="space-y-1.5">
              {pattern.checklist.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px] text-white/65 leading-relaxed">
                  <span className="text-[#1D9E75] flex-shrink-0 font-bold mt-0.5">✓</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#1D9E75] mb-2">
              จุดเข้า
            </h3>
            <ul className="space-y-1.5">
              {pattern.entry.map((e, i) => (
                <li key={i} className="text-[12.5px] text-white/65 leading-relaxed">{e}</li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#E24B4A] mb-2">
              จุดระวัง / Failure Case
            </h3>
            <ul className="space-y-1.5">
              {pattern.failure.map((f, i) => (
                <li key={i} className="text-[12.5px] text-white/65 leading-relaxed">{f}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
