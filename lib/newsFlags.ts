// public/data/news_flags.json (scripts/build_news_flags.py) — shape + pure helpers for NewsFlagBadges.

export type FlagSeverity = 'red' | 'orange' | 'blue' | 'purple' | 'gray' | 'green';

export interface NewsFlag {
  type: string;
  label: string;
  severity: FlagSeverity;
  date: string | null;
  title: string | null;
  link: string | null;
}

export interface NewsFlagsFile {
  generated_at?: string;
  as_of?: string;
  flags?: Record<string, NewsFlag[]>;
}

export const SEVERITY_ORDER: FlagSeverity[] = ['red', 'orange', 'blue', 'purple', 'gray', 'green'];
export const MAX_VISIBLE_FLAGS = 3;

const rank = (s: string) => {
  const i = SEVERITY_ORDER.indexOf(s as FlagSeverity);
  return i < 0 ? SEVERITY_ORDER.length : i;
};

/** Flags for one ticker, red first; anything malformed is dropped. Missing file / ticker → []. */
export function flagsFor(file: NewsFlagsFile | null | undefined, ticker: string): NewsFlag[] {
  const list = file?.flags?.[ticker];
  if (!Array.isArray(list)) return [];
  return list
    .filter((f): f is NewsFlag => !!f && typeof f.label === 'string' && f.label !== '' && typeof f.severity === 'string')
    .sort((a, b) => rank(a.severity) - rank(b.severity));
}

/** Split into the badges shown and the count folded into "+n". */
export function splitVisible(flags: NewsFlag[], max = MAX_VISIBLE_FLAGS): { shown: NewsFlag[]; more: NewsFlag[] } {
  return { shown: flags.slice(0, max), more: flags.slice(max) };
}

/** Only http(s) links open; anything else is ignored. */
export function safeLink(link: string | null | undefined): string | null {
  return typeof link === 'string' && /^https?:\/\//.test(link) ? link : null;
}
