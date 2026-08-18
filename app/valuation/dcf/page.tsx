'use client';

export default function DCFPage() {
  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 shadow-sm">
        <h1 className="text-[20px] font-bold text-white tracking-tight">Discounted Cash Flow (DCF)</h1>
        <p className="text-[13px] text-white/40 mt-1">ประเมินมูลค่าหุ้นด้วยกระแสเงินสดคิดลด (FCFF / FCFE)</p>
      </div>
      <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-12 text-center space-y-3">
        <div className="text-[32px]">🚧</div>
        <h2 className="text-[18px] font-bold text-white">โมเดล DCF Valuation — เร็วๆ นี้</h2>
        <p className="text-[13px] text-white/40 max-w-md mx-auto">
          กำลังพัฒนาระบบคำนวณ Free Cash Flow to Firm (FCFF), Terminal Value และ Weighted Average Cost of Capital (WACC)
        </p>
      </div>
    </div>
  );
}
