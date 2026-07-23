import rawMacro from '@/data/scans/macro_commodities.json';

export async function GET() {
  const m = (rawMacro as any)?.default ?? rawMacro ?? {};
  return Response.json(m, {
    headers: {
      'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
