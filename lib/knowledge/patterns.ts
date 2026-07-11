import type { ShapeConfig, MarkerConfig, ZoneConfig } from './syntheticData';

// Table-style right-card content (phase / price behaviour / psychology or
// "what to watch for") — used instead of the checklist/entry/failure lists
// for patterns whose explanation is naturally a phase-by-phase table
// (Dow's 3 Phases, Wyckoff's 4-phase cycle).
export interface PhaseTableRow {
  phase: string;
  priceBehavior: string;
  note: string; // psychology (Dow) or "จุดสังเกต" (Wyckoff)
}

export interface KnowledgePattern {
  id: string;
  name: string;
  description: string;
  checklist: string[];
  entry: string[];
  failure: string[];
  shape: ShapeConfig;
  markers: MarkerConfig[];
  zones?: ZoneConfig[]; // shaded background regions (phase zones)
  phaseTable?: PhaseTableRow[]; // if set, rendered instead of checklist/entry/failure
}

export interface KnowledgeTab {
  id: string;
  label: string;
  intro: string;
  patterns: KnowledgePattern[];
  showRelationshipTable?: boolean; // Dow/Wyckoff/Market Stage mapping, shown at tab bottom
}

// Same 8-item Trend Template checklist text as app/sepa/page.tsx's
// TREND_TEMPLATE_CONDITIONS — reused verbatim per user confirmation, not
// rewritten, so the two pages never drift out of sync.
const TREND_TEMPLATE_8 = [
  'T1: ราคา > SMA150 และ SMA200',
  'T2: SMA50 > SMA150 และ SMA200',
  'T3: SMA150 > SMA200',
  'T4: SMA200 เทรนด์ขึ้น ≥ 1 เดือน',
  'T5: ราคา > SMA50',
  'T6: ราคา ≥ 52w Low × 1.30',
  'T7: ราคา ≥ 52w High × 0.75',
  'T8: RS Rating ≥ 70',
];

export const KNOWLEDGE_TABS: KnowledgeTab[] = [
  // ── 1. Market Stage (pine_stages + stage_all) ───────────────────────────
  {
    id: 'market-stage',
    label: 'Market Stage',
    intro:
      'จำแนกหุ้นตามทฤษฎี Stan Weinstein โดยดูตำแหน่งราคาเทียบ EMA50/EMA200 — scan จริงแบ่งละเอียดเป็น 7 stage (S.Bull, Bull, Accumulation, Recovery, Warning, Distribution, Bear) หน้านี้จัดกลุ่มเป็น 4 stage คลาสสิกเพื่อให้เข้าใจง่าย',
    patterns: [
      {
        id: 'stage1-basing',
        name: 'Stage 1 — Basing',
        description:
          'ราคาหยุดร่วงแล้วเริ่มแกว่งตัว sideways เหนือ EMA50 แต่ยังต่ำกว่า EMA200 ปริมาณซื้อขายเบาบางกว่าช่วงมีเทรนด์ชัดเจน เป็นช่วงสะสมก่อนเลือกทิศทาง (ตรงกับ "Recovery" ใน scan จริง)',
        checklist: [
          'ราคา > EMA50 แต่ < EMA200',
          'EMA50 ยังต่ำกว่า EMA200 (ยังไม่ตัดขึ้น)',
          'แกว่งตัว sideways ไม่มีทิศทางชัดเจน',
          'Volume เบาบางกว่าช่วงเทรนด์',
        ],
        entry: [
          'ยังไม่ใช่จุดเข้าซื้อ — รอดูว่าจะ breakout ขึ้นเป็น Stage 2 หรือหลุดกลับเป็น Stage 4',
          'สัญญาณเปลี่ยนเป็น Stage 2 คือ EMA50 ตัดขึ้นเหนือ EMA200',
        ],
        failure: [
          'ถ้าราคาหลุดกลับต่ำกว่า EMA50 อีกครั้ง อาจเป็นแค่ dead-cat bounce ใน Stage 4 ต่อ ไม่ใช่ Stage 1 จริง',
        ],
        shape: {
          seed: 101,
          startPrice: 100,
          segments: [
            { bars: 90, trendPct: -45, volatilityPct: 3, volumeBase: 110 },
            { bars: 140, trendPct: 6, volatilityPct: 2.2, volumeBase: 60, volumeTrendPct: -15 },
          ],
        },
        markers: [{ atBar: 90, label: 'เริ่ม Basing', color: '#9e9e9e', position: 'belowBar' }],
      },
      {
        id: 'stage2-advancing',
        name: 'Stage 2 — Advancing',
        description:
          'ราคาวิ่งขึ้นต่อเนื่อง ยืนเหนือทั้ง EMA50 และ EMA200 โดย EMA50 อยู่เหนือ EMA200 (ตัดขึ้นแล้ว) ปริมาณซื้อขายมักพุ่งในวันที่ราคาขึ้น (ตรงกับ "Bull"/"S.Bull" ใน scan จริง)',
        checklist: [
          'ราคา > EMA50 > EMA200',
          'ราคาทำ higher-high, higher-low ต่อเนื่อง',
          'Volume ขยายตัวในวันบวก',
        ],
        entry: [
          'จุดเข้าที่ดีคือช่วง pullback มาใกล้ EMA50 แล้วเด้งกลับขึ้น ไม่ใช่ตอนราคาวิ่งไกลจาก EMA แล้ว',
        ],
        failure: [
          'ถ้าราคาหลุด EMA50 ลงมาบ่อยและแรงขึ้นเรื่อยๆ อาจเป็นสัญญาณเริ่มเข้าสู่ Stage 3',
        ],
        shape: {
          seed: 102,
          startPrice: 100,
          segments: [
            { bars: 60, trendPct: 3, volatilityPct: 2, volumeBase: 60 },
            { bars: 10, trendPct: 12, volatilityPct: 3, volumeBase: 140, volumeSpikeAt: 5, volumeSpikeMult: 2 },
            { bars: 160, trendPct: 78, volatilityPct: 2.5, volumeBase: 100, volumeTrendPct: 20 },
          ],
        },
        markers: [{ atBar: 60, label: 'Breakout เข้า Stage 2', color: '#4caf50', position: 'belowBar' }],
      },
      {
        id: 'stage3-topping',
        name: 'Stage 3 — Topping',
        description:
          'หลังขึ้นมานาน ราคาเริ่ม choppy แกว่งไปมาข้าม EMA50 ทิศทางไม่ชัด มักเห็น volume ผิดปกติ (วันลงมี volume มากกว่าวันขึ้น) เป็นสัญญาณเตือนว่าเทรนด์กำลังจะจบ (ตรงกับ "Warning" ใน scan จริง)',
        checklist: [
          'ราคาหลุดต่ำกว่า EMA50 บ่อยขึ้น แต่ EMA50 ยังเหนือ EMA200 อยู่',
          'แกว่งตัว sideways กว้างใกล้จุดสูงสุด',
          'Volume วันลงเริ่มมากกว่าวันขึ้น',
        ],
        entry: [
          'ไม่ใช่จุดเข้าซื้อใหม่ — เป็นสัญญาณเตือนให้ลด position หรือรัดเข้มจุดตัดขาดทุนของสถานะเดิม',
        ],
        failure: [
          'ถ้าเข้าใจผิดว่าเป็นแค่ pullback ปกติแล้วถือต่อ อาจโดนลากเข้า Stage 4 เต็มตัว',
        ],
        shape: {
          seed: 103,
          startPrice: 100,
          segments: [
            { bars: 140, trendPct: 65, volatilityPct: 2.5, volumeBase: 100 },
            { bars: 90, trendPct: -3, volatilityPct: 4, volumeBase: 90, volumeTrendPct: 15 },
          ],
        },
        markers: [{ atBar: 140, label: 'เริ่ม Topping', color: '#FFEB3B', position: 'aboveBar' }],
      },
      {
        id: 'stage4-declining',
        name: 'Stage 4 — Declining',
        description:
          'ราคาหลุดลงต่ำกว่าทั้ง EMA50 และ EMA200 โดย EMA50 ตัดลงต่ำกว่า EMA200 แล้ว เทรนด์ขาลงชัดเจน Volume มักพุ่งแรงในวันร่วง (ตรงกับ "Distribution"/"Bear" ใน scan จริง)',
        checklist: [
          'ราคา < EMA50 < EMA200',
          'ราคาทำ lower-high, lower-low ต่อเนื่อง',
          'Volume ขยายตัวในวันลบ (แรงขายหนัก)',
        ],
        entry: ['ไม่ใช่จังหวะซื้อ — หากถือหุ้นอยู่ควรพิจารณาตัดขาดทุนแล้ว'],
        failure: [
          'การรีบาวด์ระยะสั้นใน Stage 4 มักเป็นกับดัก (bull trap) ไม่ใช่การกลับตัวจริง',
        ],
        shape: {
          seed: 104,
          startPrice: 100,
          segments: [
            { bars: 55, trendPct: 0, volatilityPct: 3, volumeBase: 90 },
            { bars: 175, trendPct: -55, volatilityPct: 3, volumeBase: 130, volumeTrendPct: 15 },
          ],
        },
        markers: [{ atBar: 55, label: 'เริ่ม Decline', color: '#ef5350', position: 'aboveBar' }],
      },
    ],
  },

  // ── 2. SEPA ──────────────────────────────────────────────────────────────
  {
    id: 'sepa',
    label: 'SEPA',
    intro:
      'Trend Template ต้องผ่านครบ 8 ข้อตามหนังสือ Trade Like a Stock Market Wizard (Minervini, p.79) — VCP และ Breakout from Pivot เป็นรูปแบบฐานที่มักเกิดขึ้นก่อนหุ้นจะขึ้นทะเบียน Trend Template ครบ',
    patterns: [
      {
        id: 'trend-template',
        name: 'Trend Template (Uptrend ในอุดมคติ)',
        description:
          'หุ้นที่อยู่ในเทรนด์ขาขึ้นสมบูรณ์แบบตาม Trend Template ทั้ง 8 ข้อ ราคายืนเหนือ SMA50/150/200 เรียงลำดับถูกต้อง และ SMA200 กำลังชันขึ้น',
        checklist: TREND_TEMPLATE_8,
        entry: [
          'เข้าซื้อตอน pullback มาที่ SMA50 หรือ breakout จากฐานใหม่ ไม่ใช่ตอนราคาวิ่งไกลจากฐานแล้ว',
        ],
        failure: [
          'ถ้า SMA200 เริ่มแบนหรือหักหัวลง แม้ราคายังเหนือ SMA50/200 ก็ต้องระวัง เทรนด์อาจกำลังอ่อนแรง',
        ],
        shape: {
          seed: 201,
          startPrice: 100,
          segments: [
            { bars: 30, trendPct: 2, volatilityPct: 2, volumeBase: 60 },
            { bars: 190, trendPct: 90, volatilityPct: 2.3, volumeBase: 100, volumeTrendPct: 15 },
          ],
        },
        markers: [{ atBar: 30, label: 'เข้าเงื่อนไข Trend Template', color: '#1D9E75', position: 'belowBar' }],
      },
      {
        id: 'vcp',
        name: 'VCP (Volatility Contraction Pattern)',
        description:
          'ราคาแกว่งตัวเป็นชุด swing ที่หดตัวลงเรื่อยๆ (สวิงแรกกว้าง สวิงถัดไปแคบลง) พร้อม volume ที่แห้งลงในแต่ละรอบ ก่อนจะ breakout ด้วย volume ที่กลับมาพุ่ง',
        checklist: [
          'แต่ละรอบ swing (correction) มีขนาดเล็กลงกว่ารอบก่อนหน้า',
          'Volume หดตัว/แห้งลงในแต่ละรอบ correction',
          'ราคายังคงอยู่เหนือ SMA50 ตลอด (ไม่หลุดเทรนด์หลัก)',
          'จุดหดตัวสุดท้าย (tightest point) มักมี volume ต่ำสุด',
        ],
        entry: [
          'เข้าซื้อตอน breakout จากจุดหดตัวสุดท้าย (tightest point) พร้อม volume ที่พุ่งกลับมา',
        ],
        failure: [
          'ถ้า volume ไม่แห้งจริงในรอบหดตัว หรือ swing ไม่ได้แคบลงจริง อาจเป็นแค่ choppy sideways ธรรมดา ไม่ใช่ VCP แท้',
        ],
        shape: {
          seed: 202,
          startPrice: 100,
          segments: [
            { bars: 100, trendPct: 35, volatilityPct: 2, volumeBase: 100 },
            { bars: 25, trendPct: -18, volatilityPct: 3, volumeBase: 130 },
            { bars: 20, trendPct: 15, volatilityPct: 2, volumeBase: 80, volumeTrendPct: -25 },
            { bars: 18, trendPct: -10, volatilityPct: 2, volumeBase: 65 },
            { bars: 15, trendPct: 9, volatilityPct: 1.5, volumeBase: 45, volumeTrendPct: -20 },
            { bars: 12, trendPct: -5, volatilityPct: 1.2, volumeBase: 30 },
            { bars: 25, trendPct: 22, volatilityPct: 2.5, volumeBase: 150, volumeSpikeAt: 2, volumeSpikeMult: 2.5 },
          ],
        },
        markers: [
          { atBar: 125, label: 'Swing 1 (กว้าง)', color: '#E24B4A', position: 'aboveBar' },
          { atBar: 168, label: 'Swing 2 (แคบลง)', color: '#EF9F27', position: 'aboveBar' },
          { atBar: 193, label: 'จุดหดตัวสุดท้าย', color: '#378ADD', position: 'belowBar' },
          { atBar: 205, label: 'Breakout', color: '#1D9E75', position: 'belowBar' },
        ],
      },
      {
        id: 'breakout-pivot',
        name: 'Breakout from Pivot',
        description:
          'ราคาสร้างฐาน (base) ที่มีแนวต้านชัดเจน (pivot point) แล้ว breakout ทะลุขึ้นด้วย volume ที่สูงกว่าปกติอย่างชัดเจน',
        checklist: [
          'มีแนวต้าน (pivot) ที่ราคาเคยเทสหลายครั้งแต่ผ่านไม่ได้',
          'Volume ในวัน breakout สูงกว่าค่าเฉลี่ยอย่างชัดเจน',
          'ราคาปิดเหนือแนวต้านเดิม ไม่ใช่แค่แหย่ขึ้นไปแล้วร่วงกลับ',
        ],
        entry: [
          'เข้าซื้อทันทีที่ราคา breakout ผ่านแนวต้านพร้อม volume ยืนยัน หรือรอ pullback มาเทสแนวต้านเดิม (ที่กลายเป็นแนวรับ) แล้วเด้งขึ้น',
        ],
        failure: [
          'Breakout ที่ volume ไม่ยืนยัน (volume เบา) มักจบด้วยการหลุดกลับเข้าฐานเดิม (false breakout)',
        ],
        shape: {
          seed: 203,
          startPrice: 100,
          segments: [
            { bars: 80, trendPct: 30, volatilityPct: 2, volumeBase: 90 },
            { bars: 60, trendPct: 0, volatilityPct: 2.5, volumeBase: 55, volumeTrendPct: -20 },
            { bars: 12, trendPct: 18, volatilityPct: 3, volumeBase: 160, volumeSpikeAt: 2, volumeSpikeMult: 2.2 },
            { bars: 80, trendPct: 25, volatilityPct: 2.3, volumeBase: 100 },
          ],
        },
        markers: [
          { atBar: 80, label: 'เริ่มสร้างฐาน (pivot ~เดิม)', color: '#378ADD', position: 'aboveBar' },
          { atBar: 140, label: 'Breakout ผ่าน Pivot', color: '#1D9E75', position: 'belowBar' },
        ],
      },
    ],
  },

  // ── 3. Oliver Kell (price cycle) ─────────────────────────────────────────
  {
    id: 'oliver-kell',
    label: 'Oliver Kell',
    intro:
      'แนวคิด Price Cycle ของ Oliver Kell อธิบายวงจรพฤติกรรมราคาของหุ้นผู้นำตลาด — scan จริงของเราตรวจจับเฉพาะช่วง "EMA Crossback" (สัญญาณ EMAC Buy / Trend Riding) เป็นหลัก ส่วนอีก 5 stage เป็นแนวคิดเชิงคุณภาพสำหรับทำความเข้าใจวงจรทั้งหมด ไม่ได้ผูกกับตัวเลขจาก scan โดยตรง',
    patterns: [
      {
        id: 'reversal-extension',
        name: 'Reversal Extension',
        description:
          'ราคาพุ่งขึ้นแรงและไกลจาก EMA อย่างรวดเร็ว (มักมาจากข่าวหรือ gap) จนยืดเกินไป ก่อนจะกลับตัวลงแรงเมื่อแรงซื้อหมด',
        checklist: [
          'ราคาพุ่งขึ้นชันมากในเวลาสั้นๆ ไกลจาก EMA10/EMA20 ผิดปกติ',
          'Volume พุ่งสูงสุดในช่วงพุ่งขึ้น',
          'เริ่มมีแท่งกลับตัว (reversal candle) ที่ volume สูงหลังจากพุ่งไกล',
        ],
        entry: ['ไม่ใช่จุดเข้าซื้อ — เป็นสัญญาณเตือนให้ระวังการกลับตัว ไม่ใช่จังหวะไล่ราคา'],
        failure: ['การไล่ซื้อตอนราคายืดไกลจาก EMA แล้วมักโดนกลับตัวแรงในไม่กี่วัน'],
        shape: {
          seed: 301,
          startPrice: 100,
          segments: [
            { bars: 120, trendPct: 20, volatilityPct: 2.5, volumeBase: 80 },
            { bars: 15, trendPct: 55, volatilityPct: 3.5, volumeBase: 170, volumeTrendPct: 30 },
            { bars: 90, trendPct: -35, volatilityPct: 3.5, volumeBase: 120 },
          ],
        },
        markers: [
          { atBar: 135, label: 'จุดยืดสุดขีด (Extension)', color: '#E24B4A', position: 'aboveBar' },
          { atBar: 136, label: 'กลับตัวลง', color: '#ef5350', position: 'aboveBar' },
        ],
      },
      {
        id: 'wedge-pop',
        name: 'Wedge Pop',
        description:
          'ราคาไต่ขึ้นแบบ rising wedge (higher-high, higher-low แต่กรอบแคบลงเรื่อยๆ) ก่อนจะ "pop" ทะลุกรอบบนขึ้นไปพร้อมแรงซื้อขยายตัว',
        checklist: [
          'ราคาไต่ขึ้นในกรอบ wedge ที่แคบลงเรื่อยๆ (higher-low ชันกว่า higher-high)',
          'Volume ค่อนข้างเบาระหว่างไต่ขึ้นใน wedge',
          'ทะลุกรอบบนของ wedge พร้อม volume ที่ขยายตัวชัดเจน',
        ],
        entry: ['เข้าซื้อเมื่อราคาทะลุกรอบบนของ wedge พร้อม volume ยืนยัน'],
        failure: ['ถ้าทะลุกรอบแต่ volume ไม่ขยายตัว มักเป็น pop ปลอมแล้วร่วงกลับเข้า wedge'],
        shape: {
          seed: 302,
          startPrice: 100,
          segments: [
            { bars: 75, trendPct: 10, volatilityPct: 2.5, volumeBase: 90 },
            { bars: 70, trendPct: 25, volatilityPct: 1.4, volumeBase: 55, volumeTrendPct: -10 },
            { bars: 15, trendPct: 20, volatilityPct: 3, volumeBase: 160, volumeSpikeAt: 3, volumeSpikeMult: 2.3 },
            { bars: 65, trendPct: 30, volatilityPct: 2.3, volumeBase: 100 },
          ],
        },
        markers: [{ atBar: 145, label: 'Wedge Pop (ทะลุกรอบ)', color: '#1D9E75', position: 'belowBar' }],
      },
      {
        id: 'ema-crossback',
        name: 'EMA Crossback (EMAC)',
        description:
          'ราคาพักตัวลงมาแตะใกล้ EMA10/EMA20 ในเทรนด์ขาขึ้น โดย EMA10 หลุดลงต่ำกว่า EMA20 ชั่วคราว ก่อนตัดกลับขึ้นเหนือ EMA20 อีกครั้งแบบแนบชิด (ระยะห่างจาก EMA ไม่เกิน 3.5% ตาม scan จริง) เป็นจุดเข้าซื้อต่อเทรนด์',
        checklist: [
          'ราคาอยู่เหนือ EMA10 และ EMA20 ทั้งคู่',
          'EMA10 ตัดกลับขึ้นเหนือ EMA20 (crossback) หลังจากเคยหลุดลงมาชั่วคราว',
          'EMA10 และ EMA20 กำลังชันขึ้นทั้งคู่ (เทียบกับ 5 วันก่อน)',
          'ราคาแนบชิด EMA10 หรือ EMA20 ห่างไม่เกิน 3.5%',
        ],
        entry: ['เข้าซื้อทันทีที่เกิด EMA Crossback แบบแนบชิด ("EMAC Buy" ตาม scan จริง)'],
        failure: ['ถ้าราคาหลุดต่ำกว่า EMA20 แรงหลัง crossback แสดงว่าสัญญาณอาจล้มเหลว ไม่ใช่แค่พักตัว'],
        shape: {
          seed: 303,
          startPrice: 100,
          segments: [
            { bars: 105, trendPct: 40, volatilityPct: 2, volumeBase: 100 },
            { bars: 12, trendPct: -6, volatilityPct: 1.8, volumeBase: 55, volumeTrendPct: -15 },
            { bars: 8, trendPct: 5, volatilityPct: 1.3, volumeBase: 70 },
            { bars: 100, trendPct: 45, volatilityPct: 2.2, volumeBase: 100, volumeTrendPct: 10 },
          ],
        },
        markers: [{ atBar: 125, label: 'EMA Crossback (EMAC)', color: '#7F77DD', position: 'belowBar' }],
      },
      {
        id: 'base-n-break',
        name: "Base n' Break",
        description:
          'หลังจากขึ้นมาระยะหนึ่ง ราคาสร้างฐานแคบในแนวนอน (tight base) เพื่อพักตัว ก่อนจะ breakout ต่อเนื่องไปในทิศทางเดิมของเทรนด์',
        checklist: [
          'มีเทรนด์ขาขึ้นชัดเจนมาก่อนหน้าฐาน',
          'ฐานมีกรอบแคบ ไม่กว้างมาก และ volume หดตัวระหว่างสร้างฐาน',
          'Breakout ทะลุขอบบนของฐานพร้อม volume ขยายตัว',
        ],
        entry: ['เข้าซื้อเมื่อราคาทะลุขอบบนของฐานพร้อม volume ยืนยัน'],
        failure: ['ฐานที่กว้างเกินไปหรือใช้เวลานานเกินไปมักแปลว่าโมเมนตัมเดิมกำลังจางหาย ไม่ใช่แค่พักตัว'],
        shape: {
          seed: 304,
          startPrice: 100,
          segments: [
            { bars: 105, trendPct: 45, volatilityPct: 2.2, volumeBase: 100 },
            { bars: 45, trendPct: 2, volatilityPct: 1.6, volumeBase: 55, volumeTrendPct: -20 },
            { bars: 12, trendPct: 16, volatilityPct: 2.8, volumeBase: 150, volumeSpikeAt: 3, volumeSpikeMult: 2.2 },
            { bars: 63, trendPct: 35, volatilityPct: 2.3, volumeBase: 100 },
          ],
        },
        markers: [
          { atBar: 105, label: 'เริ่มสร้างฐาน', color: '#378ADD', position: 'aboveBar' },
          { atBar: 150, label: "Break (ทะลุฐาน)", color: '#1D9E75', position: 'belowBar' },
        ],
      },
      {
        id: 'exhaustion-extension',
        name: 'Exhaustion Extension',
        description:
          'ราคาไต่ขึ้นต่อเนื่องยาวนานจนยืดไกลจาก EMA มากขึ้นเรื่อยๆ แบบ parabolic ไม่มีจังหวะพักตัว ก่อนจบด้วย blow-off top แล้วร่วงแรง',
        checklist: [
          'ราคาไต่ขึ้นต่อเนื่องเป็นเวลานานโดยแทบไม่มี pullback',
          'อัตราเร่งของราคาเพิ่มขึ้นเรื่อยๆ (parabolic) ในช่วงท้าย',
          'Volume พุ่งสูงสุดในวันที่ทำจุดสูงสุด (climax volume)',
        ],
        entry: ['ไม่ใช่จุดเข้าซื้อ — ความเสี่ยงกลับตัวสูงมากในจังหวะนี้'],
        failure: ['การถือสถานะต่อโดยหวังว่าจะขึ้นต่อหลัง climax volume มักจบด้วยการขาดทุนจากการกลับตัวแรง'],
        shape: {
          seed: 305,
          startPrice: 100,
          segments: [
            { bars: 85, trendPct: 30, volatilityPct: 2, volumeBase: 90 },
            { bars: 60, trendPct: 45, volatilityPct: 2.3, volumeBase: 110, volumeTrendPct: 20 },
            { bars: 30, trendPct: 60, volatilityPct: 3.5, volumeBase: 170, volumeTrendPct: 40 },
            { bars: 50, trendPct: -45, volatilityPct: 3.5, volumeBase: 140 },
          ],
        },
        markers: [{ atBar: 175, label: 'Blow-off Top', color: '#E24B4A', position: 'aboveBar' }],
      },
      {
        id: 'wedge-drop',
        name: 'Wedge Drop',
        description:
          'ตรงข้ามกับ Wedge Pop — ราคาไหลลงแบบ falling wedge (lower-high, lower-low แต่กรอบแคบลงเรื่อยๆ) ก่อนจะหลุดกรอบล่างลงไปพร้อม volume ที่ขยายตัว',
        checklist: [
          'ราคาไหลลงในกรอบ wedge ที่แคบลงเรื่อยๆ',
          'Volume ค่อนข้างเบาระหว่างไหลลงใน wedge',
          'หลุดกรอบล่างของ wedge พร้อม volume ที่ขยายตัวชัดเจน',
        ],
        entry: ['ไม่ใช่จุดเข้าซื้อ — เป็นสัญญาณขาลงต่อเนื่อง ไม่ใช่จุดกลับตัว'],
        failure: ['การไล่ซื้อโดยคิดว่า wedge จะกลับตัวขึ้นมักโดนราคาหลุดกรอบลงต่อ'],
        shape: {
          seed: 306,
          startPrice: 100,
          segments: [
            { bars: 75, trendPct: -10, volatilityPct: 2.5, volumeBase: 90 },
            { bars: 70, trendPct: -22, volatilityPct: 1.5, volumeBase: 55, volumeTrendPct: -10 },
            { bars: 15, trendPct: -18, volatilityPct: 3, volumeBase: 150, volumeSpikeAt: 3, volumeSpikeMult: 2.2 },
            { bars: 65, trendPct: -25, volatilityPct: 2.3, volumeBase: 110 },
          ],
        },
        markers: [{ atBar: 145, label: 'Wedge Drop (หลุดกรอบ)', color: '#E24B4A', position: 'aboveBar' }],
      },
    ],
  },

  // ── 4. Breakout (accumulation_breakout) ─────────────────────────────────
  {
    id: 'breakout',
    label: 'Breakout',
    intro:
      'scan_accumulation_breakout.py มองหาหุ้นที่สร้างฐานแคบและกำลังจ่อทะลุ — เกณฑ์จริงจาก config: กรอบฐานไม่เกิน 45% ของช่วง 150 วัน, SMA150 ความชันไม่เกิน ±2.5%, และราคาห่างจากขอบบนไม่เกิน 5%',
    patterns: [
      {
        id: 'accumulation-to-breakout',
        name: 'Accumulation → Volume Breakout',
        description:
          'หุ้นสร้างฐานแคบ (กรอบราคานิ่ง) นาน ~150 วัน โดย SMA150 ค่อนข้างแบน และ volume แห้งลงระหว่างสร้างฐาน ก่อนราคาเข้าใกล้ขอบบนของกรอบแล้ว breakout ทะลุพร้อม volume พุ่งขึ้นชัดเจน',
        checklist: [
          'กรอบราคา (base) แคบ ไม่เกิน 45% ของช่วง 150 วันย้อนหลัง',
          'SMA150 ค่อนข้างแบน (ความชันไม่เกิน ±2.5% เทียบกับ 20 วันก่อน)',
          'ราคาอยู่เหนือ SMA150',
          'ราคาเข้าใกล้ขอบบนของกรอบ (ไม่เกิน 5% จากจุดสูงสุดของฐาน)',
        ],
        entry: ['เข้าซื้อเมื่อราคาทะลุขอบบนของกรอบ (base high) พร้อม volume ที่สูงกว่าปกติชัดเจน'],
        failure: [
          'ถ้าฐานกว้างเกินไป (>45%) หรือ SMA150 ยังมีความชันชัดเจน (ไม่แบน) แสดงว่ายังไม่ใช่ฐานที่สมบูรณ์ตาม scan นี้',
          'Breakout ที่ volume ไม่ขยายตัวมักหลุดกลับเข้าฐานเดิม',
        ],
        shape: {
          seed: 401,
          startPrice: 100,
          segments: [
            { bars: 30, trendPct: 15, volatilityPct: 2, volumeBase: 90 },
            { bars: 130, trendPct: 3, volatilityPct: 1.8, volumeBase: 55, volumeTrendPct: -25 },
            { bars: 12, trendPct: 18, volatilityPct: 3, volumeBase: 165, volumeSpikeAt: 3, volumeSpikeMult: 2.4 },
            { bars: 50, trendPct: 22, volatilityPct: 2.2, volumeBase: 100 },
          ],
        },
        markers: [
          { atBar: 30, label: 'เริ่ม Accumulation', color: '#EF9F27', position: 'aboveBar' },
          { atBar: 160, label: 'Volume Breakout', color: '#1D9E75', position: 'belowBar' },
        ],
      },
    ],
  },

  // ── 5. PPBP ──────────────────────────────────────────────────────────────
  {
    id: 'ppbp',
    label: 'PPBP',
    intro:
      'scan_ppbp.py (Pocket Pivot Buy Point) — เกณฑ์ตรงจาก source code ทั้ง 3 ข้อ ไม่มีการตีความเพิ่ม',
    patterns: [
      {
        id: 'pocket-pivot',
        name: 'Pocket Pivot Buy Point',
        description:
          'วันที่ราคาปิดบวก (Close > Open) โดยมี Volume สูงกว่า Volume ของทุกวันที่ราคาลงใน 10 วันก่อนหน้า และสูงกว่าค่าเฉลี่ย Volume 50 วันด้วย — สัญญาณว่าแรงซื้อสถาบันเริ่มไล่เก็บโดยไม่ต้องรอ breakout เต็มรูปแบบ',
        checklist: [
          'วันนี้เป็นวันราคาขึ้น (Close > Open)',
          'Volume วันนี้ > Volume ของทุกวันที่ราคาลง (Close ≤ Open) ใน 10 วันก่อนหน้า',
          'Volume วันนี้ > ค่าเฉลี่ย Volume 50 วันก่อนหน้า (ไม่รวมวันนี้)',
        ],
        entry: [
          'เข้าซื้อในวันที่เกิดสัญญาณ Pocket Pivot เลย ไม่ต้องรอ breakout เต็มรูปแบบ เพราะเป็นสัญญาณว่าแรงซื้อสถาบันเริ่มเข้ามาก่อนราคาจะขยับแรง',
        ],
        failure: [
          'ถ้าเกิด pocket pivot ตอนราคาอยู่ไกลจาก EMA/SMA มากแล้ว (extended) ความเสี่ยงจากจุดเข้าจะสูงขึ้น ควรรอ pullback แทน',
        ],
        shape: {
          seed: 501,
          startPrice: 100,
          segments: [
            { bars: 105, trendPct: 35, volatilityPct: 2.2, volumeBase: 95 },
            { bars: 25, trendPct: -8, volatilityPct: 2, volumeBase: 70, volumeTrendPct: -10 },
            { bars: 1, trendPct: 4, volatilityPct: 1, volumeBase: 180, volumeSpikeAt: 0, volumeSpikeMult: 2.6 },
            { bars: 94, trendPct: 30, volatilityPct: 2.3, volumeBase: 100 },
          ],
        },
        markers: [{ atBar: 130, label: 'Pocket Pivot', color: '#7F77DD', position: 'belowBar' }],
      },
    ],
  },

  // ── 6. Dow Theory ────────────────────────────────────────────────────────
  {
    id: 'dow-theory',
    label: 'Dow Theory',
    intro:
      'ทฤษฎีของ Charles Dow (ผู้ก่อตั้ง Dow Jones และ Wall Street Journal) เป็นรากฐานของการวิเคราะห์ทางเทคนิคสมัยใหม่ ใช้ประเมินทิศทางตลาดภาพใหญ่ (Macro) ก่อนตัดสินใจเทรดหุ้นรายตัว — ไม่ใช่ระบบ scan เชิงตัวเลขในหน้านี้ แต่เป็นกรอบความคิดที่ Market Stage scan ของเราแปลงมาเป็นเงื่อนไขอัตโนมัติ',
    showRelationshipTable: true,
    patterns: [
      {
        id: 'three-movements',
        name: 'Three Movements (3 ระดับเทรนด์)',
        description:
          'Dow แบ่งการเคลื่อนไหวของราคาออกเป็น 3 ชั้นซ้อนกันตามกรอบเวลา — Primary (แนวโน้มหลัก 1-3 ปี), Secondary (การพักฐานสวนทาง Primary เป็นสัปดาห์ถึงเดือน), และ Minor (ความผันผวนรายวันที่ไม่มีนัยสำคัญ) นักลงทุนต้องแยกให้ออกว่ากำลังเห็นระดับไหนอยู่ ไม่ให้ Secondary หรือ Minor มาบดบัง Primary',
        checklist: [
          'ตลาด "discount" ทุกอย่างไว้ในราคาแล้ว — ข้อมูลที่รู้กันทั่วไปสะท้อนอยู่ในราคาปัจจุบันแล้วเสมอ',
          'ต้องหา Primary Trend (แนวโน้มหลัก) ให้เจอก่อน แล้วอยู่ฝั่งเดียวกับตลาด ไม่สวนเทรนด์หลัก',
          'Secondary Movement เป็นแค่การพักฐานสวนทาง Primary ชั่วคราว (สัปดาห์-เดือน) ไม่ใช่การกลับตัวของเทรนด์หลัก',
          'Minor Movement คือความผันผวนรายวันที่เป็น "นอยส์" ไม่มีนัยสำคัญต่อทิศทางใหญ่',
          'Volume ต้องยืนยันเทรนด์ — เบรคแนวต้านแต่ volume แห้ง = สัญญาณไม่แข็งแรง',
          'ดัชนีต้องยืนยันกันเอง (เช่น Dow Industrials ต้องเคลื่อนไหวสอดคล้องกับ Dow Transportation) สัญญาณเทรนด์ถึงจะเชื่อถือได้เต็มที่',
        ],
        entry: [
          'ใช้ Primary Trend เป็นตัวกรองทิศทางใหญ่ก่อนเปิดสถานะ — ถ้า Primary เป็นขาขึ้น ให้เน้นหา setup ฝั่งซื้อเป็นหลัก',
        ],
        failure: [
          'การเข้าไม้สวน Primary Trend เพียงเพราะ Secondary Movement ดูน่าดึงดูด มักจบด้วยการโดนเทรนด์หลักที่แข็งแกร่งกว่าลากกลับ',
        ],
        shape: {
          seed: 601,
          startPrice: 100,
          segments: [
            { bars: 130, trendPct: 50, volatilityPct: 2.2, volumeBase: 90 },
            { bars: 35, trendPct: -18, volatilityPct: 2.5, volumeBase: 70, volumeTrendPct: -10 },
            { bars: 135, trendPct: 55, volatilityPct: 2.3, volumeBase: 100, volumeTrendPct: 15 },
          ],
        },
        zones: [
          { fromBar: 0, toBar: 130, color: 'rgba(29,158,117,0.07)', label: 'Primary (ขาขึ้นหลัก)' },
          { fromBar: 130, toBar: 165, color: 'rgba(226,75,74,0.10)', label: 'Secondary (พักฐาน)' },
          { fromBar: 165, toBar: 300, color: 'rgba(29,158,117,0.07)', label: 'Primary (ขาขึ้นหลัก)' },
        ],
        markers: [
          { atBar: 130, label: 'เริ่ม Secondary (พักฐาน)', color: '#E24B4A', position: 'aboveBar' },
          { atBar: 165, label: 'กลับสู่ Primary', color: '#1D9E75', position: 'belowBar' },
        ],
      },
      {
        id: 'primary-trend-phases',
        name: 'Primary Trend 3 Phases',
        description:
          'แนวโน้มหลัก (Primary Trend) หนึ่งรอบเต็มแบ่งได้เป็น 3 ระยะตามพฤติกรรมราคาและจิตวิทยาตลาด — Accumulation (สะสม) → Public Participation (แห่ซื้อตาม) → Distribution (กระจายขาย) เป็น pattern ที่ตลาดหุ้นสวิงวนซ้ำตลอดประวัติศาสตร์',
        checklist: [],
        entry: [],
        failure: [],
        phaseTable: [
          {
            phase: 'Accumulation',
            priceBehavior: 'ราคาซึมตัวอยู่ในกรอบแคบ เคลื่อนไหวน้อย หลังจากลงมานาน',
            note: 'ข่าวร้ายเต็มตลาด นักลงทุนรายย่อยหมดหวังเทขายทิ้ง แต่ Smart Money เริ่มเก็บสะสมเงียบๆ',
          },
          {
            phase: 'Public Participation',
            priceBehavior: 'เทรนด์ขาขึ้นชัดเจน ราคาวิ่งแรงต่อเนื่อง เป็นช่วงที่ราคาวิ่งไกลที่สุดในทั้งวงจร',
            note: 'ผลประกอบการเริ่มดีขึ้นชัดเจน นักลงทุนตามเทรนด์ (trend followers) เริ่มเข้าซื้อตาม ความเชื่อมั่นฟื้นตัว',
          },
          {
            phase: 'Distribution',
            priceBehavior: 'ราคาทำจุดสูงสุดใหม่ (new high) แต่เริ่ม choppy แกว่งกว้างไม่ไปต่อ',
            note: 'ข่าวดีเต็มสื่อ ความเชื่อมั่นสูงสุด รายย่อยแห่เข้าซื้อ ขณะที่ Smart Money ทยอยขายทำกำไร (distribute) ออกอย่างเงียบๆ',
          },
        ],
        shape: {
          seed: 602,
          startPrice: 100,
          segments: [
            { bars: 110, trendPct: -5, volatilityPct: 1.8, volumeBase: 50 },
            { bars: 160, trendPct: 85, volatilityPct: 2.3, volumeBase: 110, volumeTrendPct: 25 },
            { bars: 90, trendPct: 8, volatilityPct: 3.2, volumeBase: 100, volumeTrendPct: 10 },
          ],
        },
        zones: [
          { fromBar: 0, toBar: 110, color: 'rgba(158,158,158,0.10)', label: 'Accumulation' },
          { fromBar: 110, toBar: 270, color: 'rgba(29,158,117,0.08)', label: 'Public Participation' },
          { fromBar: 270, toBar: 360, color: 'rgba(226,75,74,0.10)', label: 'Distribution' },
        ],
        markers: [
          { atBar: 110, label: 'เข้าสู่ Public Participation', color: '#1D9E75', position: 'belowBar' },
          { atBar: 270, label: 'เข้าสู่ Distribution', color: '#EF9F27', position: 'aboveBar' },
        ],
      },
    ],
  },

  // ── 7. Wyckoff ───────────────────────────────────────────────────────────
  {
    id: 'wyckoff',
    label: 'Wyckoff',
    intro:
      'วิธีของ Richard Wyckoff เน้นอ่าน "ร่องรอย" ของนักลงทุนรายใหญ่ (Smart Money) ผ่านความสัมพันธ์ระหว่างราคาและ volume ในกราฟรายวัน เพื่อหาจุดที่รายใหญ่กำลังสะสมหรือกระจายหุ้น — ละเอียดกว่า Dow Theory ตรงที่มองระดับกราฟรายวัน ไม่ใช่ภาพรวมตลาด',
    showRelationshipTable: true,
    patterns: [
      {
        id: 'three-laws',
        name: 'กฎ 3 ข้อของ Wyckoff',
        description:
          'รากฐานทั้งหมดของวิธี Wyckoff อยู่บนกฎ 3 ข้อนี้ — ใช้อ่านว่าใครกำลังควบคุมตลาด (ผู้ซื้อหรือผู้ขาย) และรายใหญ่กำลังทำอะไรอยู่เบื้องหลังการเคลื่อนไหวของราคาที่เห็น',
        checklist: [
          'Law of Supply & Demand: ราคาขึ้นเมื่อ demand มากกว่า supply และราคาลงเมื่อ supply มากกว่า demand — กฎพื้นฐานที่สุดที่กฎอื่นต่อยอดมาจากตรงนี้',
          'Law of Cause & Effect: ฐานสะสม (Cause) ยิ่งกว้างหรือใช้เวลานานเท่าไหร่ การเคลื่อนไหวครั้งต่อไป (Effect) ยิ่งไปได้ไกลเท่านั้น',
          'Law of Effort vs Result: เทียบ volume (effort) กับระยะราคาที่เคลื่อนไหวจริง (result) — ถ้า volume มหาศาลแต่ราคาแทบไม่ขยับ แปลว่ามีแรงต้านซ่อนอยู่ (Absorption)',
        ],
        entry: [
          'ใช้ Effort vs Result เป็นสัญญาณเตือน: volume สูงผิดปกติแต่ spread แคบ มักบ่งบอกว่ารายใหญ่กำลังดูดซับ (ซื้อสะสมหรือขายทิ้ง) อยู่เบื้องหลัง ควรรอดูทิศทางที่ชัดเจนกว่านี้ก่อน',
        ],
        failure: [
          'ตีความ volume สูงเป็นสัญญาณ breakout เสมอโดยไม่เทียบกับ "result" (ระยะราคา) ที่เกิดขึ้นจริง อาจพลาดสัญญาณ Absorption ที่แท้จริงคือการเขย่า ไม่ใช่การไปต่อ',
        ],
        shape: {
          seed: 701,
          startPrice: 100,
          segments: [
            { bars: 70, trendPct: -8, volatilityPct: 2, volumeBase: 70 },
            { bars: 90, trendPct: 2, volatilityPct: 1.6, volumeBase: 45, volumeTrendPct: -15 },
            { bars: 1, trendPct: 0.5, volatilityPct: 1, volumeBase: 200, volumeSpikeAt: 0, volumeSpikeMult: 3.2 },
            { bars: 15, trendPct: 3, volatilityPct: 1.8, volumeBase: 60 },
            { bars: 90, trendPct: 45, volatilityPct: 2.3, volumeBase: 110, volumeTrendPct: 20 },
          ],
        },
        zones: [
          { fromBar: 70, toBar: 161, color: 'rgba(158,158,158,0.10)', label: 'Cause (ฐานสะสม)' },
          { fromBar: 176, toBar: 266, color: 'rgba(29,158,117,0.07)', label: 'Effect' },
        ],
        markers: [
          { atBar: 160, label: 'Effort vs Result (Absorption)', color: '#7F77DD', position: 'aboveBar' },
          { atBar: 176, label: 'Breakout (Effect จาก Cause)', color: '#1D9E75', position: 'belowBar' },
        ],
      },
      {
        id: 'wyckoff-cycle',
        name: 'Wyckoff Cycle (4 ระยะ)',
        description:
          'วงจรเต็มของ Wyckoff แบ่งเป็น 4 ระยะ — Accumulation (รายใหญ่สะสม) → Markup (ราคาวิ่งขึ้น) → Distribution (รายใหญ่กระจายขาย) → Markdown (ราคาร่วง) พร้อม event ที่เป็นลายเซ็นของแต่ละระยะ (SC, Spring, LPS, UTAD)',
        checklist: [],
        entry: [],
        failure: [],
        phaseTable: [
          {
            phase: 'Accumulation',
            priceBehavior:
              'กรอบ sideway บริเวณโซนล่าง มี Selling Climax (SC) เทขายทะลุกรอบล่างด้วย volume มหาศาล ตามด้วย Spring ที่เขย่าหลุดแนวรับหลอกๆ ก่อนดึงกลับเข้ากรอบ',
            note: 'จุด SC และ Spring คือจังหวะที่ Smart Money "เขย่า" ให้รายย่อยตกใจขายทิ้งก่อนจะเก็บของราคาถูก',
          },
          {
            phase: 'Markup',
            priceBehavior:
              'ราคาเบรคขึ้นจากกรอบ Accumulation เทรนด์ขาขึ้นชัดเจน มีจุดพักฐานเป็นฐานย่อยที่สูงขึ้นเรื่อยๆ (LPS)',
            note: 'LPS (Last Point of Support) คือจุดเข้าซื้อต่อเนื่องที่ความเสี่ยงต่ำ เพราะเป็นฐานย่อยเหนือฐานเดิม ไม่ใช่การกลับตัว',
          },
          {
            phase: 'Distribution',
            priceBehavior:
              'กรอบบริเวณโซนบน ราคาพยายามทะลุแนวต้านขึ้นไปแต่ยืนไม่ได้ (UTAD) แล้วร่วงกลับเข้ากรอบ',
            note: 'UTAD (Upthrust After Distribution) คือกับดักฝั่งขาขึ้น (bull trap) หลอกให้รายย่อยไล่ซื้อก่อนราคาจะพลิกลง',
          },
          {
            phase: 'Markdown',
            priceBehavior: 'ราคาหลุดแนวรับของกรอบ Distribution ลงมาเร็วและแรง พร้อม volume ขายที่หนาแน่น',
            note: 'ช่วงที่ควรหลีกเลี่ยงการถือสถานะ Long เพราะแรงขายยังไม่หมด',
          },
        ],
        shape: {
          seed: 702,
          startPrice: 100,
          segments: [
            { bars: 15, trendPct: -15, volatilityPct: 3.5, volumeBase: 160, volumeSpikeAt: 14, volumeSpikeMult: 2.5 },
            { bars: 55, trendPct: 3, volatilityPct: 2, volumeBase: 70, volumeTrendPct: -20 },
            { bars: 8, trendPct: -9, volatilityPct: 2.5, volumeBase: 90, volumeSpikeAt: 7, volumeSpikeMult: 1.8 },
            { bars: 12, trendPct: 12, volatilityPct: 2, volumeBase: 70 },
            { bars: 45, trendPct: 25, volatilityPct: 2.2, volumeBase: 100, volumeTrendPct: 15 },
            { bars: 20, trendPct: -3, volatilityPct: 1.6, volumeBase: 55, volumeTrendPct: -15 },
            { bars: 65, trendPct: 40, volatilityPct: 2.3, volumeBase: 110, volumeTrendPct: 10 },
            { bars: 55, trendPct: 5, volatilityPct: 2.8, volumeBase: 100 },
            { bars: 10, trendPct: 10, volatilityPct: 2.5, volumeBase: 150, volumeSpikeAt: 9, volumeSpikeMult: 2.3 },
            { bars: 25, trendPct: -8, volatilityPct: 2.5, volumeBase: 95 },
            { bars: 20, trendPct: -10, volatilityPct: 2.5, volumeBase: 110, volumeTrendPct: 10 },
            { bars: 70, trendPct: -45, volatilityPct: 3, volumeBase: 140, volumeTrendPct: 20 },
          ],
        },
        zones: [
          { fromBar: 0, toBar: 90, color: 'rgba(158,158,158,0.10)', label: 'Accumulation' },
          { fromBar: 90, toBar: 220, color: 'rgba(29,158,117,0.08)', label: 'Markup' },
          { fromBar: 220, toBar: 310, color: 'rgba(226,75,74,0.08)', label: 'Distribution' },
          { fromBar: 310, toBar: 400, color: 'rgba(226,75,74,0.14)', label: 'Markdown' },
        ],
        markers: [
          { atBar: 14, label: 'SC (Selling Climax)', color: '#E24B4A', position: 'belowBar' },
          { atBar: 77, label: 'Spring (เขย่าหลุดแนวรับหลอก)', color: '#7F77DD', position: 'belowBar' },
          { atBar: 153, label: 'LPS (ฐานย่อยสูงขึ้น)', color: '#1D9E75', position: 'belowBar' },
          { atBar: 284, label: 'UTAD (ทะลุแนวต้านหลอก)', color: '#EF9F27', position: 'aboveBar' },
        ],
      },
    ],
  },
];

// ── Dow / Wyckoff / Market Stage relationship table ─────────────────────────
// Shown once at the bottom of both the Dow Theory and Wyckoff tabs (same
// component instance, reused) — maps the three frameworks' phase names onto
// each other and onto this dashboard's own Market Stage scan labels.
export interface RelationshipRow {
  dow: string;
  wyckoff: string;
  stageLabel: string;
  stagePatternId: string; // pattern id inside the 'market-stage' tab to jump to
}

export const RELATIONSHIP_TABLE: RelationshipRow[] = [
  { dow: 'Accumulation', wyckoff: 'Accumulation (Spring/SC)', stageLabel: 'Stage 1 Basing', stagePatternId: 'stage1-basing' },
  { dow: 'Public Participation', wyckoff: 'Markup (LPS)', stageLabel: 'Stage 2 Advancing', stagePatternId: 'stage2-advancing' },
  { dow: 'Distribution', wyckoff: 'Distribution (UTAD)', stageLabel: 'Stage 3 Topping', stagePatternId: 'stage3-topping' },
  { dow: '— (Bear primary)', wyckoff: 'Markdown', stageLabel: 'Stage 4 Declining', stagePatternId: 'stage4-declining' },
];

export const RELATIONSHIP_SUMMARY: string[] = [
  'Dow Theory ใช้ประเมินทิศทางลมภาพใหญ่ (Macro) — ถ้าตลาดโดยรวมยังไม่เข้าสู่ช่วง Public Participation หุ้นที่ breakout รายตัวมักไปได้ไม่ไกล เพราะสวนทิศทางลมใหญ่',
  'Wyckoff ใช้ส่องร่องรอยของรายใหญ่ในระดับกราฟรายวัน หาจุดจบของ Accumulation (สัญญาณ Spring หรือ LPS) ที่ความเสี่ยงต่ำที่สุดก่อนเข้าสู่ Markup',
  'ทั้งสองศาสตร์ใช้ Volume เป็นตัวกรองความจริงเหมือนกัน — Dow ใช้ volume ยืนยันเทรนด์ภาพกว้าง ส่วน Wyckoff ใช้ volume จับคู่กับ spread ของแต่ละแท่งเพื่อหาจุดดักซื้อดักขายที่ละเอียดกว่า',
];

export const RELATIONSHIP_CLOSING =
  '"Market Stage" scan ของ dashboard นี้ คือการแปลง cycle เหล่านี้ให้เป็นเงื่อนไขเชิงตัวเลขที่ตรวจจับอัตโนมัติ';

export const RELATIONSHIP_REFERENCES: string[] = [
  'Rhea, R. (1932). The Dow Theory.',
  'Edwards, R. D., & Magee, J. (1948). Technical Analysis of Stock Trends.',
  'Wyckoff, R. D. (1931). The Richard D. Wyckoff Method of Trading and Investing in Stocks.',
  'Pruden, H. (2007). The Three Skills of Top Trading.',
];
