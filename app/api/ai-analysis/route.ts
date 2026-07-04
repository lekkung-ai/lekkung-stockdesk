import type { NextRequest } from 'next/server';
import { buildStockContext, formatStockContext } from '@/lib/aiContext';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Basic sanity check — SET tickers are 1-10 chars, letters/digits/dash/dot.
function isValidTicker(t: string): boolean {
  return /^[A-Z0-9.\-]{1,10}$/.test(t);
}

function buildSystemPrompt(ticker: string, contextText: string): string {
  return `คุณเป็นผู้ช่วยวิเคราะห์หุ้น ${ticker} เท่านั้น
ใช้ข้อมูลบริบทที่ให้มาเป็นหลัก:

${contextText}

กติกา:
- ตอบเฉพาะเรื่องหุ้น ${ticker} เท่านั้น ถ้าผู้ใช้ถามเรื่องหุ้นตัวอื่นหรือเรื่องที่ไม่เกี่ยวข้อง ให้ปฏิเสธอย่างสุภาพและเชิญชวนให้ถามเกี่ยวกับ ${ticker} แทน
- วิเคราะห์โดยใช้เลนส์ SEPA (Minervini), CAN SLIM, และ Stage Analysis จากข้อมูลบริบทที่มี
- ถ้าข้อมูลในบริบทไม่พอที่จะตอบ ให้บอกตรงๆ ว่าไม่มีข้อมูลเพียงพอ ห้ามเดาหรือสร้างตัวเลขขึ้นมาเอง
- ตอบเป็นภาษาไทย กระชับ ตรงประเด็น ไม่ต้องปูพื้นยาว
- นี่ไม่ใช่คำแนะนำการลงทุน เป็นการวิเคราะห์ข้อมูลเชิงเทคนิค/พื้นฐานเท่านั้น`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[ai-analysis] GEMINI_API_KEY is not set');
    return Response.json({ error: 'ai_not_configured' }, { status: 500 });
  }

  let body: { ticker?: string; question?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  const ticker = (body.ticker ?? '').trim().toUpperCase();
  const question = (body.question ?? '').trim();

  if (!ticker || !isValidTicker(ticker)) {
    return Response.json({ error: 'invalid_ticker' }, { status: 400 });
  }
  if (!question) {
    return Response.json({ error: 'missing_question' }, { status: 400 });
  }
  if (question.length > 1000) {
    return Response.json({ error: 'question_too_long' }, { status: 400 });
  }

  try {
    const context = await buildStockContext(req.nextUrl.origin, ticker);
    const contextText = formatStockContext(context);
    const systemPrompt = buildSystemPrompt(ticker, contextText);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: question }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error(`[ai-analysis] Gemini upstream ${geminiRes.status}: ${errText}`);
      return Response.json({ error: 'ai_upstream_failed' }, { status: 502 });
    }

    const geminiJson = await geminiRes.json();
    const answer: string | undefined =
      geminiJson?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') || undefined;

    if (!answer) {
      const blockReason = geminiJson?.promptFeedback?.blockReason;
      console.error('[ai-analysis] Gemini returned no answer', blockReason ? { blockReason } : geminiJson);
      return Response.json({ error: 'ai_empty_response' }, { status: 502 });
    }

    return Response.json({ answer, ticker }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[ai-analysis] failed:', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
