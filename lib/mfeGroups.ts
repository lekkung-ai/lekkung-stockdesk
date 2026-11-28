// 4-group split of closed setups by "how high it went (MFE)" vs "what was sold (return)".
// Single source for the thresholds; points = [mfe_pct, return_pct] (same data as the old dot chart).

export const MFE_NEVER_RAN_PCT = 3; // MFE below this = never ran
export const MFE_KEEP_RATIO = 0.5; // sold >= this share of MFE = kept well
export const MFE_SMALL_N = 10;

export type MfeGroupKey = 'never' | 'gaveAll' | 'gaveHalf' | 'kept';
export const MFE_GROUP_KEYS: MfeGroupKey[] = ['never', 'gaveAll', 'gaveHalf', 'kept'];

export function classifyMfe(mfe: number, ret: number): MfeGroupKey {
  if (!(mfe >= MFE_NEVER_RAN_PCT)) return 'never';
  if (ret <= 0) return 'gaveAll';
  return ret >= MFE_KEEP_RATIO * mfe ? 'kept' : 'gaveHalf';
}

export interface MfeGroupStat {
  key: MfeGroupKey;
  n: number;
  pct: number; // share of all points, 0-100
  avgMfe: number | null;
  avgRet: number | null;
}

export interface MfeGroups {
  total: number;
  small: boolean;
  groups: MfeGroupStat[]; // always 4, in MFE_GROUP_KEYS order
  main: 'never' | 'gaveAll' | null; // bigger of the two problem groups
}

export function groupMfe(points: [number, number][]): MfeGroups {
  const acc = MFE_GROUP_KEYS.map(() => ({ n: 0, m: 0, r: 0 }));
  let total = 0;
  for (const p of points) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    const a = acc[MFE_GROUP_KEYS.indexOf(classifyMfe(p[0], p[1]))];
    a.n++; a.m += p[0]; a.r += p[1]; total++;
  }
  const groups = MFE_GROUP_KEYS.map((key, i) => ({
    key,
    n: acc[i].n,
    pct: total ? (acc[i].n / total) * 100 : 0,
    avgMfe: acc[i].n ? acc[i].m / acc[i].n : null,
    avgRet: acc[i].n ? acc[i].r / acc[i].n : null,
  }));
  const [nv, ga] = [groups[0].n, groups[1].n];
  const main = total === 0 || (nv === 0 && ga === 0) ? null : nv >= ga ? 'never' : 'gaveAll';
  return { total, small: total < MFE_SMALL_N, groups, main };
}

export function mfeHeadline(g: MfeGroups): { main: string; mainPct: number; other: string; otherPct: number } | null {
  if (!g.main) return null;
  const nv = g.groups[0], ga = g.groups[1];
  const isNever = g.main === 'never';
  return {
    main: isNever ? 'เลือกหุ้น/จังหวะเข้า' : 'จุดขาย',
    mainPct: isNever ? nv.pct : ga.pct,
    other: isNever ? 'จุดขาย' : 'เลือกหุ้น/จังหวะเข้า',
    otherPct: isNever ? ga.pct : nv.pct,
  };
}
