'use client';

import {
  RELATIONSHIP_TABLE,
  RELATIONSHIP_SUMMARY,
  RELATIONSHIP_CLOSING,
  RELATIONSHIP_REFERENCES,
} from '@/lib/knowledge/patterns';

// Shown at the bottom of both the Dow Theory and Wyckoff tabs (one shared
// component instance) — maps the three frameworks' phases onto each other
// and links each row to the matching pattern in the Market Stage tab.
export default function KnowledgeRelationshipTable({
  onJumpToStage,
}: {
  onJumpToStage: (patternId: string) => void;
}) {
  return (
    <div className="bg-[#13161e] border border-white/[0.07] rounded-xl p-5 space-y-5">
      <div>
        <h2 className="text-[14px] font-bold text-white mb-1.5">ความสัมพันธ์ระหว่างสามศาสตร์</h2>
        <p className="text-[12.5px] text-white/50 leading-relaxed">
          Dow Theory, Wyckoff, และ Market Stage scan ของ dashboard นี้ อธิบายวงจรราคาเดียวกันจากคนละมุม — ตารางนี้เชื่อมคำศัพท์ของแต่ละศาสตร์เข้าด้วยกัน
        </p>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[12.5px] min-w-[480px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-white/30">
              <th className="text-left font-semibold px-2 py-2">Dow</th>
              <th className="text-left font-semibold px-2 py-2">Wyckoff</th>
              <th className="text-left font-semibold px-2 py-2">Market Stage (scan เรา)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {RELATIONSHIP_TABLE.map((row) => (
              <tr key={row.stagePatternId}>
                <td className="px-2 py-2.5 text-white/70">{row.dow}</td>
                <td className="px-2 py-2.5 text-white/70">{row.wyckoff}</td>
                <td className="px-2 py-2.5">
                  <button
                    onClick={() => onJumpToStage(row.stagePatternId)}
                    className="text-[#7F77DD] hover:text-white font-medium underline decoration-dotted underline-offset-2 transition-colors"
                  >
                    {row.stageLabel}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2.5">
        {RELATIONSHIP_SUMMARY.map((p, i) => (
          <p key={i} className="text-[12.5px] text-white/65 leading-relaxed">
            {p}
          </p>
        ))}
        <p className="text-[12.5px] text-white/85 leading-relaxed font-medium">{RELATIONSHIP_CLOSING}</p>
      </div>

      <div className="pt-3 border-t border-white/[0.06]">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/25 mb-1.5">อ้างอิง</h3>
        <ul className="space-y-0.5">
          {RELATIONSHIP_REFERENCES.map((ref, i) => (
            <li key={i} className="text-[10.5px] text-white/25 leading-relaxed">
              {ref}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
