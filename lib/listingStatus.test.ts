import { describe, it, expect } from 'vitest';
import {
  buildListingIndex,
  getListingStatus,
  inactiveStatuses,
  isDelistHeadline,
  newsDate,
  newsTickers,
  thaiDateLabel,
  tradingOnLatestSession,
  type ListingSources,
  type ManualListingChanges,
} from './listingStatus';
import manualFile from '../data/manual_listing_changes.json';

const SET = 'SET (ตลาดหลักทรัพย์)';
// 2026-08-25 10:29 ICT
const TS_0825 = 1787621362000;

const sources = (over: Partial<ListingSources> = {}): ListingSources => ({
  snapshots: [],
  news: [],
  listed: ['PTT', 'GLAND', 'GST', 'COLOUR', 'BANPU', 'AKS'],
  ...over,
});

describe('isDelistHeadline (same rule as build_news_flags.py)', () => {
  it('matches an actual SET delisting', () => {
    expect(isDelistHeadline('ตลาดหลักทรัพย์ฯ เพิกถอนหลักทรัพย์ของ CIMBT GLAND และ LRH จากการเป็นหลักทรัพย์จดทะเบียน และจะเปิดให้ซื้อขาย')).toBe(true);
    expect(isDelistHeadline('ตลาดหลักทรัพย์ฯ เพิกถอน BANPUU และ BPP จากการเป็นหลักทรัพย์จดทะเบียน')).toBe(true);
  });

  it('ignores "อาจถูกเพิกถอน", mark headlines and pre-delisting reminders', () => {
    expect(isDelistHeadline('ตลาดหลักทรัพย์ฯ ประกาศเพิ่มเหตุเข้าข่ายอาจถูกเพิกถอนหลักทรัพย์ ECF กรณีส่วนของผู้ถือหุ้นมีค่าน้อยกว่าศูนย์')).toBe(false);
    expect(isDelistHeadline('ตลาดหลักทรัพย์ฯ ขึ้น SP หลักทรัพย์ X และเพิกถอน X จากการเป็นหลักทรัพย์จดทะเบียน')).toBe(false);
    expect(isDelistHeadline('11 กันยายน 2569 เป็นวันซื้อขายวันสุดท้ายของหลักทรัพย์ของ CIMBT ก่อนการเพิกถอน')).toBe(false);
    expect(isDelistHeadline(null)).toBe(false);
  });
});

describe('newsTickers / newsDate', () => {
  it('uses tickerHint, else title tokens that are in the universe', () => {
    const u = new Set(['CIMBT', 'GLAND', 'LRH']);
    expect(newsTickers({ tickerHint: 'gland', title: 'x' }, u)).toEqual(['GLAND']);
    expect(newsTickers({ tickerHint: 'SET', title: 'เพิกถอน CIMBT GLAND และ LRH และ XYZ' }, u)).toEqual(['CIMBT', 'GLAND', 'LRH']);
    expect(newsTickers({ title: 'ไม่มีชื่อหุ้น' }, u)).toEqual([]);
  });

  it('dates in Asia/Bangkok from ts, else pubDate', () => {
    expect(newsDate({ ts: Date.UTC(2026, 7, 24, 18, 30) })).toBe('2026-08-25'); // 01:30 ICT
    expect(newsDate({ pubDate: '2026-10-14T18:08:12+07:00' })).toBe('2026-10-14');
    expect(newsDate({})).toBeNull();
  });
});

describe('getListingStatus', () => {
  it('renamed from a universe_changes snapshot, dated by the first snapshot that saw it', () => {
    const idx = buildListingIndex(sources({
      snapshots: [
        { date: '2026-10-05', renamed: [{ old: 'THCOM', new: 'GST' }] },
        { date: '2026-09-28', renamed: [{ old: 'THCOM', new: 'GST' }] },
      ],
    }));
    expect(getListingStatus('thcom', idx)).toEqual({ status: 'renamed', newTicker: 'GST', date: '2026-09-28', source: 'universe_changes' });
    expect(getListingStatus('GST', idx).status).toBe('active');
  });

  it('skips a temporary symbol (old still listed, new not listed)', () => {
    const idx = buildListingIndex(sources({ snapshots: [{ date: '2026-07-27', renamed: [{ old: 'BANPU', new: 'BANPUU' }] }] }));
    expect(getListingStatus('BANPU', idx)).toEqual({ status: 'active', source: 'universe' });
  });

  it('delisted from a snapshot takes its date from the SET headline', () => {
    const idx = buildListingIndex(sources({
      snapshots: [{ date: '2026-09-14', delisted: [{ ticker: 'GLAND' }, { ticker: 'PTECH' }] }],
      news: [{ source: SET, tickerHint: 'GLAND', ts: TS_0825, title: 'ตลาดหลักทรัพย์ฯ เพิกถอนหลักทรัพย์ของ CIMBT GLAND และ LRH จากการเป็นหลักทรัพย์จดทะเบียน' }],
    }));
    // GLAND is still in sector_map, but the delisting wins
    expect(getListingStatus('GLAND', idx)).toEqual({ status: 'delisted', date: '2026-08-25', source: 'universe_changes' });
    expect(getListingStatus('PTECH', idx)).toEqual({ status: 'delisted', source: 'universe_changes' });
  });

  it('falls back to the SET headline alone; non-SET sources and "อาจ" do not count', () => {
    const idx = buildListingIndex(sources({
      news: [
        { source: SET, tickerHint: null, ts: TS_0825, title: 'ตลาดหลักทรัพย์ฯ เพิกถอน BANPUU และ BPP จากการเป็นหลักทรัพย์จดทะเบียน' },
        { source: SET, tickerHint: 'BANPUU', ts: TS_0825, title: 'อื่น ๆ' },
        { source: SET, tickerHint: 'BPP', ts: TS_0825, title: 'อื่น ๆ' },
        { source: 'Prachachat', tickerHint: 'PTT', ts: TS_0825, title: 'ตลาดหลักทรัพย์ฯ เพิกถอน PTT จากการเป็นหลักทรัพย์จดทะเบียน' },
        { source: SET, tickerHint: 'AKS', ts: TS_0825, title: 'ขึ้น SP หลักทรัพย์ของ AKS ซึ่งอาจเข้าข่ายอาจถูกเพิกถอน' },
      ],
    }));
    expect(getListingStatus('BPP', idx)).toEqual({ status: 'delisted', date: '2026-08-25', source: 'set_news' });
    expect(getListingStatus('BANPUU', idx).status).toBe('delisted');
    expect(getListingStatus('PTT', idx).status).toBe('active');
    expect(getListingStatus('AKS', idx).status).toBe('active');
  });

  it('a later "new" entry cancels a snapshot delisting', () => {
    const idx = buildListingIndex(sources({
      snapshots: [
        { date: '2026-08-03', delisted: [{ ticker: 'DV8' }] },
        { date: '2026-08-17', new: [{ ticker: 'DV8' }] },
      ],
    }));
    expect(getListingStatus('DV8', idx)).toEqual({ status: 'unknown', source: 'none' });
  });

  it('no evidence anywhere → unknown (missing prices are not evidence)', () => {
    const idx = buildListingIndex(sources());
    expect(getListingStatus('PSTC', idx)).toEqual({ status: 'unknown', source: 'none' });
    expect(getListingStatus('PTT', idx)).toEqual({ status: 'active', source: 'universe' });
  });

  it('inactiveStatuses lists only delisted / renamed tickers', () => {
    const idx = buildListingIndex(sources({
      snapshots: [{ date: '2026-09-14', delisted: [{ ticker: 'LRH' }], renamed: [{ old: 'COLOR', new: 'COLOUR' }] }],
    }));
    expect(Object.keys(inactiveStatuses(idx)).sort()).toEqual(['COLOR', 'LRH']);
  });
});

describe('thaiDateLabel', () => {
  it('formats a Buddhist-era short date', () => {
    expect(thaiDateLabel('2026-08-25')).toBe('25 ส.ค. 2569');
    expect(thaiDateLabel('2026-09-28')).toBe('28 ก.ย. 2569');
    expect(thaiDateLabel('bad')).toBe('');
    expect(thaiDateLabel(undefined)).toBe('');
  });
});

describe('manual_listing_changes.json (last in line: universe_changes → SET news → manual)', () => {
  it('the real file: PSTC → renamed → POWER', () => {
    const idx = buildListingIndex(sources({ manual: manualFile as ManualListingChanges }));
    expect(getListingStatus('PSTC', idx)).toEqual({ status: 'renamed', newTicker: 'POWER', source: 'manual' });
  });

  it('every row must carry evidence', () => {
    for (const r of [...(manualFile.renamed ?? []), ...(manualFile.delisted ?? [])]) {
      expect(typeof (r as { evidence?: unknown }).evidence === 'string' && (r as { evidence: string }).evidence.trim() !== '').toBe(true);
    }
    const idx = buildListingIndex(sources({
      manual: { renamed: [{ from: 'AAA', to: 'BBB' }, { from: 'CCC', to: 'DDD', evidence: ' ' }], delisted: [{ ticker: 'EEE' }] },
    }));
    expect(getListingStatus('AAA', idx).status).toBe('unknown');
    expect(getListingStatus('CCC', idx).status).toBe('unknown');
    expect(getListingStatus('EEE', idx).status).toBe('unknown');
  });

  it('universe_changes and SET news win over manual', () => {
    const idx = buildListingIndex(sources({
      snapshots: [{ date: '2026-09-28', renamed: [{ old: 'THCOM', new: 'GST' }] }],
      news: [{ source: SET, tickerHint: 'BPP', ts: TS_0825, title: 'ตลาดหลักทรัพย์ฯ เพิกถอน BPP จากการเป็นหลักทรัพย์จดทะเบียน' }],
      manual: {
        renamed: [{ from: 'THCOM', to: 'XXX', evidence: 'e' }, { from: 'BPP', to: 'YYY', evidence: 'e' }],
        delisted: [{ ticker: 'ZZZ', date: '2026-01-02', evidence: 'e' }],
      },
    }));
    expect(getListingStatus('THCOM', idx).newTicker).toBe('GST');
    expect(getListingStatus('BPP', idx)).toEqual({ status: 'delisted', date: '2026-08-25', source: 'set_news' });
    expect(getListingStatus('ZZZ', idx)).toEqual({ status: 'delisted', date: '2026-01-02', source: 'manual' });
    expect(Object.keys(inactiveStatuses(idx)).sort()).toEqual(['BPP', 'THCOM', 'ZZZ']);
  });
});

describe('tradingOnLatestSession (price only says "still trading", never decides the status)', () => {
  // 2026-10-14 16:55 ICT / 2026-10-13 16:55 ICT
  const T14 = 1791946500;
  const T13 = T14 - 86400;
  it('trading = bar on the latest session date with volume', () => {
    const live = tradingOnLatestSession([
      { name: 'PTT', time: T14, volume: 1e8 },
      { name: 'AKS', time: T14, volume: 1383649 },
      { name: 'OLD', time: T13, volume: 500 },
      { name: 'ZERO', time: T14, volume: 0 },
      { name: 'BAD', time: null, volume: 9 },
    ]);
    expect([...live].sort()).toEqual(['AKS', 'PTT']);
  });

  it('a holiday does not matter: the latest date comes from the bars, not the clock', () => {
    expect([...tradingOnLatestSession([{ name: 'PTT', time: T13, volume: 1 }, { name: 'AKS', time: T13, volume: 1 }])].sort()).toEqual(['AKS', 'PTT']);
    expect(tradingOnLatestSession([]).size).toBe(0);
  });
});
