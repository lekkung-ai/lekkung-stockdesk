export type Sentiment = 'pos' | 'neg' | 'neu';
export type WyckoffStage = 1 | 2 | 3 | 4;

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  time: string;
  sent: Sentiment;
}

export interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changeAmt: number;
  volume: string;
  sepa: boolean;
  kell: boolean;
  wyckoffStage: WyckoffStage;
  vdu: boolean;
  breakout: boolean;
  rsScore: number;
  comboScore: number;
}

export interface PricePoint {
  time: string;
  value: number;
}

export interface MarketMetrics {
  setIndex: number;
  setChange: number;
  setChangeAmt: number;
  volumeBillion: number;
  gainers: number;
  losers: number;
  unchanged: number;
  sepaPassCount: number;
  sepaTotal: number;
  vduSignalCount: number;
}

function createRng(seed: number) {
  let s = seed >>> 0;
  return (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function strToSeed(str: string): number {
  return (
    str.split('').reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0) >>> 0
  );
}

const DATES: string[] = (() => {
  const result: string[] = [];
  const d = new Date('2026-06-19');
  while (result.length < 40) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) result.unshift(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return result;
})();

export function generatePriceHistory(symbol: string, targetPrice: number): PricePoint[] {
  const rng = createRng(strToSeed(symbol));
  let price = targetPrice * (0.8 + rng() * 0.1);
  const drift = Math.pow(targetPrice / price, 1 / DATES.length);
  return DATES.map(time => {
    const noise = (rng() - 0.475) * price * 0.022;
    price = Math.max(price * drift + noise, 1);
    return { time, value: parseFloat(price.toFixed(2)) };
  });
}

export const marketMetrics: MarketMetrics = {
  setIndex: 1348.72,
  setChange: 0.84,
  setChangeAmt: 11.26,
  volumeBillion: 58.3,
  gainers: 214,
  losers: 178,
  unchanged: 95,
  sepaPassCount: 47,
  sepaTotal: 487,
  vduSignalCount: 12,
};

export const allStocks: Stock[] = [
  { symbol: 'DELTA', name: 'Delta Electronics Thai', price: 85.50, change: 2.15, changeAmt: 1.80, volume: '8.2M', sepa: true, kell: true, wyckoffStage: 2, vdu: true, breakout: false, rsScore: 92, comboScore: 4 },
  { symbol: 'AOT', name: 'Airports of Thailand', price: 62.75, change: 0.64, changeAmt: 0.40, volume: '15.1M', sepa: true, kell: false, wyckoffStage: 2, vdu: false, breakout: true, rsScore: 78, comboScore: 3 },
  { symbol: 'CPALL', name: 'CP All', price: 54.75, change: -0.45, changeAmt: -0.25, volume: '22.4M', sepa: false, kell: false, wyckoffStage: 3, vdu: false, breakout: false, rsScore: 51, comboScore: 1 },
  { symbol: 'SCB', name: 'SCB X', price: 98.25, change: 1.20, changeAmt: 1.16, volume: '5.8M', sepa: true, kell: true, wyckoffStage: 2, vdu: false, breakout: false, rsScore: 84, comboScore: 3 },
  { symbol: 'PTT', name: 'PTT PCL', price: 32.25, change: -1.22, changeAmt: -0.40, volume: '41.7M', sepa: false, kell: false, wyckoffStage: 3, vdu: false, breakout: false, rsScore: 38, comboScore: 0 },
  { symbol: 'ADVANC', name: 'Advanced Info Service', price: 219.00, change: 0.46, changeAmt: 1.00, volume: '3.1M', sepa: true, kell: false, wyckoffStage: 2, vdu: false, breakout: false, rsScore: 70, comboScore: 2 },
  { symbol: 'BDMS', name: 'Bangkok Dusit Medical', price: 28.50, change: 1.79, changeAmt: 0.50, volume: '18.3M', sepa: true, kell: true, wyckoffStage: 2, vdu: true, breakout: true, rsScore: 88, comboScore: 5 },
  { symbol: 'SCC', name: 'Siam Cement Group', price: 338.00, change: -0.59, changeAmt: -2.00, volume: '1.9M', sepa: false, kell: false, wyckoffStage: 4, vdu: false, breakout: false, rsScore: 22, comboScore: 0 },
  { symbol: 'MINT', name: 'Minor International', price: 42.75, change: 1.18, changeAmt: 0.50, volume: '11.6M', sepa: true, kell: false, wyckoffStage: 2, vdu: false, breakout: false, rsScore: 65, comboScore: 2 },
  { symbol: 'BBL', name: 'Bangkok Bank', price: 148.00, change: 0.34, changeAmt: 0.50, volume: '2.7M', sepa: false, kell: true, wyckoffStage: 1, vdu: false, breakout: false, rsScore: 56, comboScore: 1 },
];

export const watchlistSymbols = ['DELTA', 'AOT', 'CPALL', 'SCB', 'PTT', 'ADVANC', 'BDMS', 'SCC', 'MINT', 'BBL'];

export const newsBySymbol: Record<string, NewsItem[]> = {
  DELTA: [
    { id: 'd1', title: 'DELTA ทำ new high รายไตรมาส พร้อมรับออเดอร์ AI server ใหม่จากลูกค้าสหรัฐ', source: 'Bangkok Post', time: '2 ชม.', sent: 'pos' },
    { id: 'd2', title: 'นักวิเคราะห์ปรับเพิ่ม target price DELTA เป็น 95 บาท หลังผล Q1 ดีกว่าคาด', source: 'Thansettakij', time: '5 ชม.', sent: 'pos' },
    { id: 'd3', title: 'ตลาดหุ้นไทยวันนี้: DELTA นำกลุ่ม Tech พุ่งแรง Volume สูงกว่าปกติ', source: 'The Nation', time: '1 วัน', sent: 'neu' },
  ],
  AOT: [
    { id: 'a1', title: 'AOT รายงานยอดผู้โดยสารเดือน พ.ค. ทะลุ 8.2 ล้านคน สูงสุดในรอบปี', source: 'Bangkok Post', time: '3 ชม.', sent: 'pos' },
    { id: 'a2', title: 'โครงการขยาย Suvarnabhumi Phase 2 เดินหน้าตามแผน คาดเปิดใช้ปลายปี 2027', source: 'Post Today', time: '6 ชม.', sent: 'neu' },
    { id: 'a3', title: 'นักท่องเที่ยวจีน-อินเดียฟื้นตัวแรง AOT ได้ประโยชน์เต็มๆ ทั้งปี', source: 'Krungthep Turakij', time: '1 วัน', sent: 'pos' },
  ],
  CPALL: [
    { id: 'c1', title: 'CPALL กำไร Q1 ทรงตัว กดดันจากต้นทุนสวัสดิการพนักงานที่สูงขึ้น', source: 'Reuters Thai', time: '4 ชม.', sent: 'neg' },
    { id: 'c2', title: '7-Eleven ปรับโมเดลร้าน เพิ่ม fresh food จับตลาดคนทำงาน Gen Z', source: 'Settakit Plus', time: '8 ชม.', sent: 'neu' },
    { id: 'c3', title: 'CPALL ขยายสาขาใหม่ 700 แห่งทั่วประเทศในปีนี้', source: 'Prachachart', time: '2 วัน', sent: 'neu' },
  ],
  SCB: [
    { id: 's1', title: 'SCB X รายงานสินเชื่อ NPL ลดลงต่อเนื่อง ฟื้นตัวดีกว่ากลุ่ม', source: 'Bangkok Post', time: '2 ชม.', sent: 'pos' },
    { id: 's2', title: 'SCB ประกาศ Digital Lending Platform ใหม่ ปล่อยกู้ภายใน 5 นาที', source: 'Tech in Asia', time: '5 ชม.', sent: 'pos' },
    { id: 's3', title: 'ธนาคาร SCB ตั้งสำรองหนี้เพิ่ม 2 พันล้าน รับความเสี่ยงหนี้ SME', source: 'BOT Monitor', time: '1 วัน', sent: 'neg' },
  ],
  PTT: [
    { id: 'p1', title: 'PTT เผยกำไร Q2 ลดลง 12% จากราคาน้ำมันโลกผันผวนและต้นทุนที่สูง', source: 'Reuters Thai', time: '1 ชม.', sent: 'neg' },
    { id: 'p2', title: 'PTT เร่งพัฒนาพลังงานสะอาด ตั้งเป้าลงทุน Solar 10,000 MW ใน 5 ปี', source: 'Bangkok Post', time: '4 ชม.', sent: 'pos' },
    { id: 'p3', title: 'OPEC ลดกำลังการผลิต กดดันต้นทุนโรงกลั่น PTT หลายแสนบาทต่อวัน', source: 'Settakit', time: '1 วัน', sent: 'neg' },
  ],
  ADVANC: [
    { id: 'av1', title: 'AIS เปิดตัว 5G mmWave ย่านธุรกิจ รองรับ IoT ภาคอุตสาหกรรม', source: 'Techsauce', time: '3 ชม.', sent: 'pos' },
    { id: 'av2', title: 'ADVANC จ่ายปันผลระหว่างกาล 4.30 บาท/หุ้น XD วันที่ 30 มิ.ย.', source: 'SET Announcement', time: '6 ชม.', sent: 'pos' },
    { id: 'av3', title: 'แข่งขัน Data Center: AIS vs TRUE ชิงลูกค้า Enterprise', source: 'Tech Brief', time: '2 วัน', sent: 'neu' },
  ],
  BDMS: [
    { id: 'b1', title: 'BDMS กำไร Q1 โต 18% สูงสุดในกลุ่มโรงพยาบาล หนุนโดยลูกค้า Medical Tourism', source: 'Bangkok Post', time: '1 ชม.', sent: 'pos' },
    { id: 'b2', title: 'BDMS เปิด Flagship Hospital แห่งใหม่ในกรุงเทพ มูลค่า 8,000 ล้านบาท', source: 'Prachachart', time: '4 ชม.', sent: 'pos' },
    { id: 'b3', title: 'แนะนำ "ซื้อ" BDMS เป้า 33 บาท Breakout จาก Consolidation Zone', source: 'KGI Thai', time: '1 วัน', sent: 'pos' },
  ],
  SCC: [
    { id: 'sc1', title: 'SCC ปรับลดเป้ายอดขาย หลังอุปสงค์ซีเมนต์ในประเทศซบเซาต่อเนื่อง', source: 'Reuters Thai', time: '2 ชม.', sent: 'neg' },
    { id: 'sc2', title: 'SCC ชะลอแผน Expansion ในเวียดนาม รอดูสัญญาณฟื้นตัวอสังหาฯ', source: 'Business Today', time: '5 ชม.', sent: 'neg' },
    { id: 'sc3', title: 'SCC ประกาศลดเงินปันผล เหตุกระแสเงินสดตึงตัวจากเศรษฐกิจชะลอ', source: 'Thansettakij', time: '1 วัน', sent: 'neg' },
  ],
  MINT: [
    { id: 'm1', title: 'MINT รายได้ท่องเที่ยว Q1 ทะลุ 4 หมื่นล้าน โรงแรมยุโรปฟื้นตัวแข็งแกร่ง', source: 'Bangkok Post', time: '3 ชม.', sent: 'pos' },
    { id: 'm2', title: 'Minor Hotels เปิดตัว NH Collection ใหม่ 3 แห่งในยุโรปใต้', source: 'HotelierTH', time: '7 ชม.', sent: 'pos' },
    { id: 'm3', title: 'MINT ปิดดีลซื้อกิจการ Pizza company ในออสเตรเลีย เสริมธุรกิจอาหาร', source: 'Settakit', time: '2 วัน', sent: 'neu' },
  ],
  BBL: [
    { id: 'bb1', title: 'BBL รายงานสินเชื่อรวมขยายตัว 5.2% YoY ดีกว่าคาดของนักวิเคราะห์', source: 'Krungthep Turakij', time: '4 ชม.', sent: 'pos' },
    { id: 'bb2', title: 'Bangkok Bank ขยายบริการ Digital Banking ไปยัง CLMV ครบทุกประเทศ', source: 'Bangkok Post', time: '8 ชม.', sent: 'pos' },
    { id: 'bb3', title: 'BBL ถือเงินสดระดับสูง กลยุทธ์อนุรักษ์นิยม อาจพลาดโอกาสเติบโต', source: 'Analyst Note', time: '1 วัน', sent: 'neu' },
  ],
};
