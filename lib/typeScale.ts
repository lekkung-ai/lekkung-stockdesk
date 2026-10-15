// Type scale for the "big text" pages (/sector, /sector-flow, /set-index/[index]) — measured from /macro and /funds
// (Playwright computed font-size/weight, 2026-10-15) so these pages read the same size as those two.
// Only these pages use it; the site-wide scale in app/globals.css is untouched, and /macro and /funds keep their own classes.
//
//   pageTitle     22px / 800  ← /macro h1
//   sectionTitle  15px / 800  ← /macro card title (h3)
//   body          13px        ← /macro body + filter buttons, /funds table header (text-label)
//   tableCell     15px        ← /funds table cell (text-body)
//   numberMain    23px / 900  ← /macro card price
//   numberSub     13px / 600  ← /funds header tier (macro's 11px change badge sits under the site's 13px Thai floor)
//   caption       12px        ← /funds sub-heading
//
// A token never shrinks text that is already bigger (e.g. the 20px headings of the new Sector Flow layout stay).
export const TS = {
  pageTitle: 'text-[22px] font-extrabold',
  sectionTitle: 'text-[15px] font-extrabold',
  body: 'text-[13px]',
  tableCell: 'text-[15px]',
  numberMain: 'text-[23px] font-black',
  numberSub: 'text-[13px] font-semibold',
  caption: 'text-[12px]',
} as const;

/** Long explanatory paragraphs on full-width pages stop at ~90 characters per line. */
export const READABLE = 'max-w-[90ch]';
