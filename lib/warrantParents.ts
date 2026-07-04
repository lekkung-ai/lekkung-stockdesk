// Seed list of parent tickers known to have issued still-active warrants.
// Curated manually (mirrors data_engine/data/manual_input/warrants_master.csv) since
// there is no bulk "list all SET warrants" endpoint — Settrade only exposes warrants
// per parent via /api/set/stock/{parent}/related-product/W. Update this list when a
// company issues a new warrant series for a parent not already covered here; existing
// parents' warrant rosters (new series, expiries) are picked up live automatically.
export const WARRANT_PARENT_TICKERS: string[] = [
  'A5', 'ACC', 'ASW', 'B', 'BC', 'BE8', 'BR', 'BRI', 'BTC', 'BTS', 'BWG', 'CAZ', 'CEN',
  'CGH', 'CHASE', 'CHAYO', 'CHO', 'CIG', 'COMAN', 'CV', 'DCON', 'DEMCO', 'EA', 'ECF',
  'EMC', 'EMPIRE', 'GLORY', 'HYDRO', 'IMH', 'IROYAL', 'ITEL', 'J', 'JAS', 'K', 'KASET',
  'KGEN', 'KUN', 'MADAME', 'MGI', 'NER', 'NOBLE', 'NRF', 'ORI', 'PEER', 'PLANET', 'PPPM',
  'PRG', 'PROEN', 'PROS', 'PROUD', 'PSTC', 'PTECH', 'QDC', 'ROCTEC', 'SAAM', 'SAMTEL',
  'SGC', 'SKE', 'STELLA', 'TAKUNI', 'TCC', 'TEAMG', 'TFG', 'TGE', 'TL', 'TNITY', 'TPL',
  'TRUBB', 'TVDH', 'TWZ', 'UREKA', 'VGI', 'VIBHA', 'VIH', 'WAVE', 'WIIK', 'XBIO', 'ZIGA',
];
