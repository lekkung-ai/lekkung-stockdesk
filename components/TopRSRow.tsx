'use client';

export interface RSSignals {
  sepa: boolean;
  kell: boolean;
  breakout: boolean;
  combo: number;
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
  if (stage === 'Bull' || stage === 'S.Bull') return 'bg-[#EAF3DE] text-[#27500A]';
  if (stage === 'Accumulation' || stage === 'Recovery') return 'bg-[#E6F1FB] text-[#0C447C]';
  if (stage === 'Warning') return 'bg-[#FAEEDA] text-[#633806]';
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
        {sector && <div className="text-[10px] text-white/25 mt-0.5">{sector}</div>}
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
