import rawBreadth from '@/data/scans/breadth.json';

export async function GET() {
  const b = (rawBreadth as any)?.default ?? rawBreadth ?? {};
  return Response.json(b, {
    headers: {
      'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
