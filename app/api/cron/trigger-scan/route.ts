const DATA_ENGINE_REPO = 'lekkung-ai/lekkung-data-engine';
const WORKFLOW_FILE = 'daily-scan.yml';

export async function GET(request: Request) {
  if (process.env.CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return Response.json({ ok: false, error: 'GITHUB_DISPATCH_TOKEN not configured' }, { status: 500 });
  }

  const res = await fetch(
    `https://api.github.com/repos/${DATA_ENGINE_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return Response.json({ ok: false, status: res.status, error: text }, { status: 502 });
  }

  return Response.json({ ok: true, dispatchedAt: new Date().toISOString() });
}
