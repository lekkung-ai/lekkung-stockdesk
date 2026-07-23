// Single source of truth for news-source badge colors - previously
// duplicated (and drifted - StockDetailPage.tsx only had 5 of these) across
// app/news/page.tsx and components/StockDetailPage.tsx. Both now import
// this instead of keeping their own copy.
export const NEWS_SOURCE_STYLE: Record<string, string> = {
  InfoQuest: 'bg-[#E6F1FB] text-[#0C447C]',
  'ข่าวหุ้น': 'bg-[#FAEEDA] text-[#633806]',
  'ข่าวหุ้น (ด่วน)': 'bg-[#FAEEDA] text-[#633806]',
  'ข่าวหุ้น (ทั่วไป)': 'bg-[#FAEEDA] text-[#633806]',
  'RYT9 (SET)': 'bg-[#F2EDF9] text-[#4F2D7F]',
  'RYT9 (หุ้น)': 'bg-[#F2EDF9] text-[#4F2D7F]',
  'กรุงเทพธุรกิจ': 'bg-[#EAF3DE] text-[#27500A]',
  'มิติหุ้น': 'bg-[#EAF3DE] text-[#27500A]',
  'หุ้นสมาร์ท': 'bg-[#FBE8E8] text-[#8A1A1A]',
  'Share2Trade': 'bg-[#F3E8FB] text-[#5B2A86]',
  'Wealthy Thai': 'bg-[#FCEBEB] text-[#791F1F]',
  'ประชาชาติธุรกิจ': 'bg-[#EAF3DE] text-[#27500A]',
  'ฐานเศรษฐกิจ': 'bg-[#E6F1FB] text-[#0C447C]',
  'มติชน': 'bg-[#DFF3EE] text-[#0F5C4C]',
  'Investing.com': 'bg-[#E5EDFB] text-[#1A4A8A]',
  'RYT9 (IPO)': 'bg-[#F2EDF9] text-[#4F2D7F]',
  'Bangkok Post': 'bg-[#FCEBEB] text-[#791F1F]',
  HOONSMART: 'bg-[#FBE8E8] text-[#8A1A1A]',
  EFIN: 'bg-[#FDF0DC] text-[#8A5A0C]',
  'SET (ตลาดหลักทรัพย์)': 'bg-[#3B82F6]/20 text-[#60A5FA] border border-[#3B82F6]/40',
  SET: 'bg-[#3B82F6]/20 text-[#60A5FA] border border-[#3B82F6]/40',
  'Money & Banking': 'bg-[#1D9E75]/20 text-[#1D9E75] border border-[#1D9E75]/30',
  Prachachat: 'bg-[#378ADD]/20 text-[#378ADD] border border-[#378ADD]/30',
  'Standard Wealth': 'bg-[#EF9F27]/20 text-[#EF9F27] border border-[#EF9F27]/30',
  'Reporter Journey': 'bg-[#7F77DD]/20 text-[#7F77DD] border border-[#7F77DD]/30',
  'ข่าวหุ้น (คอลัมน์)': 'bg-[#FAEEDA] text-[#633806]',
};

export function newsSourceCls(s: string): string {
  return NEWS_SOURCE_STYLE[s] ?? 'bg-white/[0.07] text-white/50';
}
