import IndexConstituents from '@/components/IndexConstituents';

export default async function SetIndexPage({
  params,
}: {
  params: Promise<{ index: string }>;
}) {
  const { index } = await params;
  return <IndexConstituents index={index} />;
}
