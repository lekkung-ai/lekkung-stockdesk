import rawNvdr from '@/data/scans/nvdr.json';

export async function GET() {
  const data = (rawNvdr as any)?.default ?? rawNvdr ?? {};
  return Response.json(data, {
    headers: {
      'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
