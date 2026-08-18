'use client';

export default function DdmPage() {
  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-5 shadow-sm">
        <h1 className="text-[20px] font-bold text-white tracking-tight">Dividend Discount Model (DDM)</h1>
        <p className="text-[13px] text-white/40 mt-1">ประเมินมูลค่าหุ้นด้วยเงินปันผลคิดลด (Gordon Growth Model)</p>
      </div>
      <div className="bg-[#13161e] border border-white/[0.08] rounded-2xl p-12 text-center space-y-3">
        <div className="text-[32px]">🚧</div>
        <h2 className="text-[18px] font-bold text-white">โมเดล DDM Valuation — เร็วๆ นี้</h2>
        <p className="text-[13px] text-white/40 max-w-md mx-auto">
          กำลังพัฒนาระบบคำนวณเงินปันผลคาดการณ์, Dividend Growth Rate (g) และ Required Rate of Return (r)
        </p>
      </div>
    </div>
  );
}
