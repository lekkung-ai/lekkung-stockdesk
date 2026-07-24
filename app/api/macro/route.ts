import fs from 'fs';
import path from 'path';
import rawMacro from '@/data/scans/macro_commodities.json';

export async function GET() {
  let m = (rawMacro as any)?.default ?? rawMacro ?? {};
  try {
    const filePath = path.join(process.cwd(), 'data', 'scans', 'macro_commodities.json');
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(fileContent);
      if (parsed && parsed.commodities && Object.keys(parsed.commodities).length > 0) {
        m = parsed;
      }
    }
  } catch (err) {
    // fallback to statically imported rawMacro
  }

  return Response.json(m, {
    headers: {
      'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
