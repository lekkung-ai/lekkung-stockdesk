'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, Loader2 } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant' | 'error';
  text: string;
}

const AUTO_SUMMARY_QUESTION =
  'ช่วยสรุปภาพรวมหุ้นตัวนี้ให้หน่อย ทั้ง Stage, RS Score, SEPA, CAN SLIM, และข้อมูลพื้นฐาน (P/E, ROE) พร้อมมุมมองจากข่าวล่าสุดถ้ามี';

const ERROR_LABELS: Record<string, string> = {
  ai_not_configured: 'ระบบ AI ยังไม่ได้ตั้งค่า (ไม่มี API key)',
  invalid_ticker: 'ชื่อหุ้นไม่ถูกต้อง',
  missing_question: 'กรุณาพิมพ์คำถาม',
  question_too_long: 'คำถามยาวเกินไป',
  ai_upstream_failed: 'เรียก AI ไม่สำเร็จ ลองใหม่อีกครั้ง',
  ai_empty_response: 'AI ไม่ตอบกลับ ลองถามใหม่อีกครั้ง',
  internal_error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง',
};

export default function AiAssistant({ ticker }: { ticker: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset the conversation when the viewed ticker changes — in-memory only,
  // no localStorage/sessionStorage/cookies are used anywhere in this component.
  useEffect(() => {
    setMessages([]);
    setQuestion('');
    setLoading(false);
  }, [ticker]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;

    setMessages(prev => [...prev, { role: 'user', text: trimmed }]);
    setQuestion('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, question: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages(prev => [...prev, { role: 'error', text: ERROR_LABELS[data.error] ?? 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: data.answer }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'error', text: 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-[#7F77DD] text-white shadow-lg shadow-[#7F77DD]/30 hover:bg-[#6c64d1] transition-colors"
        aria-label="AI Assistant"
      >
        {open ? <X size={18} /> : <Sparkles size={18} />}
        <span className="text-[13px] font-semibold hidden sm:inline">
          {open ? 'ปิด' : 'AI Assistant'}
        </span>
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-40 w-[92vw] max-w-[380px] h-[70vh] max-h-[560px] flex flex-col bg-[#13161e] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07] flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles size={15} className="text-[#7F77DD] flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-white leading-none">AI Assistant</div>
                <div className="text-[11px] text-white/35 mt-0.5 truncate">วิเคราะห์เฉพาะหุ้น {ticker}</div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-6">
                <Sparkles size={24} className="text-[#7F77DD]/50" />
                <p className="text-[12px] text-white/30 max-w-[240px]">
                  ถามอะไรก็ได้เกี่ยวกับ {ticker} — วิเคราะห์จาก Stage, SEPA, CAN SLIM และข้อมูลพื้นฐานที่มีในระบบ
                </p>
                <button
                  onClick={() => ask(AUTO_SUMMARY_QUESTION)}
                  disabled={loading}
                  className="px-3.5 py-2 rounded-lg text-[12px] font-semibold bg-[#7F77DD]/15 text-[#7F77DD] hover:bg-[#7F77DD]/25 transition-colors disabled:opacity-50"
                >
                  ✨ สรุปหุ้นตัวนี้
                </button>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-[#7F77DD] text-white'
                      : m.role === 'error'
                      ? 'bg-[#E24B4A]/15 text-[#E24B4A]'
                      : 'bg-white/[0.06] text-white/80'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/[0.06] rounded-xl px-3 py-2 flex items-center gap-2">
                  <Loader2 size={13} className="animate-spin text-white/40" />
                  <span className="text-[12px] text-white/40">กำลังวิเคราะห์...</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick action (once conversation has started) */}
          {messages.length > 0 && (
            <div className="px-4 pt-1 flex-shrink-0">
              <button
                onClick={() => ask(AUTO_SUMMARY_QUESTION)}
                disabled={loading}
                className="text-[11px] text-[#7F77DD] hover:text-[#948dE0] transition-colors disabled:opacity-40"
              >
                ✨ สรุปหุ้นตัวนี้อีกครั้ง
              </button>
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={e => { e.preventDefault(); ask(question); }}
            className="flex items-center gap-2 px-3 py-3 border-t border-white/[0.07] flex-shrink-0"
          >
            <input
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder={`ถามเกี่ยวกับ ${ticker}...`}
              disabled={loading}
              className="flex-1 min-w-0 px-3 py-2 bg-white/[0.05] border border-white/[0.08] rounded-lg text-[12px] text-white/85 placeholder:text-white/25 outline-none focus:border-[#7F77DD]/50 transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="p-2 rounded-lg bg-[#7F77DD] text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#6c64d1] transition-colors flex-shrink-0"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
