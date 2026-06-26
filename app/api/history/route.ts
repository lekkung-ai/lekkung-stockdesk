import fs from 'fs';
import path from 'path';

export async function GET() {
  const indexPath = path.join(process.cwd(), 'data', 'history', 'index.json');
  try {
    const dates: string[] = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    return Response.json(
      { dates: [...dates].sort().reverse() },
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' } }
    );
  } catch {
    return Response.json({ dates: [] });
  }
}
