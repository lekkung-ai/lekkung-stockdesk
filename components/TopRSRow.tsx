'use client';

export interface RSSignals {
  sepa: boolean;
  kell: boolean;
  breakout: boolean;
  combo: number;
  isNew?: boolean;
}

interface TopRSRowProps {
  rank: number;
  ticker: string;
  sector: string | null;
  rsScore: number;
  stage: string | null;
  signals: RSSignals;
  change1d: number | null;
}

function stageCls(stage: string): string {
  if (!stage) return 'bg-white/[0.07] text-white/30';
  if (stage === 'S.Bull') return 'bg-[#1b5e20] text-white';
  if (stage === 'Bull') return 'bg-[#4caf50] text-black font-bold';
  if (stage === 'Accumulation') return 'bg-[#00bcd4] text-black font-bold';
  if (stage === 'Recovery') return 'bg-[#9e9e9e] text-black font-bold';
  if (stage === 'Warning') return 'bg-[#FFEB3B] text-black font-bold';
  if (stage === 'Distribution') return 'bg-[#ff9800] text-black font-bold';
  if (stage === 'UNKNOWN' || stage === 'Unknown') return 'bg-[#424242] text-white font-bold';
  if (stage === 'Bear') return 'bg-[#ef5350] text-white font-bold';
  return 'bg-[#FCEBEB] text-[#791F1F]';
}

function rsColor(score: number): string {
  if (score >= 80) return '#1D9E75';
  if (score >= 50) return '#BA7517';
  return '#E24B4A';
}

function comboColor(score: number): string {
  if (score >= 3) return '#1D9E75';
  if (score === 2) return '#BA7517';
  return '#6b7280';
}

export default function TopRSRow({ rank, ticker, sector, rsScore, stage, signals, change1d }: TopRSRowProps) {
  const changeColor =
    change1d == null ? '#6b7280' :
    change1d > 0 ? '#1D9E75' :
    change1d < 0 ? '#E24B4A' : '#9ca3af';

  return (
    <tr className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors">
      {/* # */}
      <td className="px-4 py-3 text-[12px] text-white/20 tabular-nums w-8">{rank}</td>

      {/* Ticker + Sector */}
      <td className="px-4 py-3">
        <div className="font-bold text-[13px] text-white leading-tight">{ticker}</div>
        <div className="text-[10px] text-white/25 mt-0.5">{sector ?? 'N/A'}</div>
      </td>

      {/* Stage */}
      <td className="px-4 py-3">
        {stage ? (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${stageCls(stage)}`}>
            {stage}
          </span>
        ) : (
          <span className="text-white/20 text-[11px]">—</span>
        )}
      </td>

      {/* Signals */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 flex-nowrap">
          {signals.isNew && (
            <span
              title="ผ่าน SEPA วันนี้ แต่ไม่ผ่านเมื่อวาน"
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#7F77DD]/20 text-[#7F77DD] whitespace-nowrap"
            >
              NEW
            </span>
          )}
          {signals.sepa && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#1D9E75]/15 text-[#1D9E75] whitespace-nowrap">
              SEPA
            </span>
          )}
          {signals.kell && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#27AE60]/15 text-[#27AE60] whitespace-nowrap">
              Kell
            </span>
          )}
          {signals.breakout && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#378ADD]/15 text-[#378ADD] whitespace-nowrap">
              BO
            </span>
          )}
          <span
            className="text-[11px] font-semibold tabular-nums ml-0.5"
            style={{ color: comboColor(signals.combo) }}
          >
            {signals.combo}/4
          </span>
        </div>
      </td>

      {/* 1D% */}
      <td className="px-4 py-3 text-right tabular-nums">
        {change1d == null ? (
          <span className="text-[12px] text-white/20">—</span>
        ) : (
          <span className="text-[12px] font-medium" style={{ color: changeColor }}>
            {change1d > 0 ? '+' : ''}{change1d.toFixed(2)}%
          </span>
        )}
      </td>

      {/* RS */}
      <td className="px-4 py-3 text-right tabular-nums">
        <span className="text-[20px] font-bold" style={{ color: rsColor(rsScore) }}>{rsScore}</span>
      </td>
    </tr>
  );
}
