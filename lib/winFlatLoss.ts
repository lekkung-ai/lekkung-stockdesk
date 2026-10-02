// ชนะ / เสมอ / แพ้ of one report_card.json horizon. Older report_card.json files
// have no n_win/n_flat/n_loss, so callers fall back to plain win rate on null.
export interface WinFlatLossFields {
  n: number;
  n_win?: number | null;
  n_flat?: number | null;
  n_loss?: number | null;
}

export interface WinFlatLossPct {
  win: number;
  flat: number;
  loss: number;
}

export function winFlatLoss(m: WinFlatLossFields | null | undefined): WinFlatLossPct | null {
  if (!m || !(m.n > 0)) return null;
  const { n_win, n_flat, n_loss } = m;
  if (n_win == null || n_flat == null || n_loss == null) return null;
  if (n_win + n_flat + n_loss !== m.n) return null;
  return { win: (n_win / m.n) * 100, flat: (n_flat / m.n) * 100, loss: (n_loss / m.n) * 100 };
}
