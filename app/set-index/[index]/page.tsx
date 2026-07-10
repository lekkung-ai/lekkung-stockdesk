import type { Metadata } from 'next';
import IndexConstituents from '@/components/IndexConstituents';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ index: string }>;
}): Promise<Metadata> {
  const { index } = await params;
  return { title: index.toUpperCase() };
}

export default async function SetIndexPage({
  params,
}: {
  params: Promise<{ index: string }>;
}) {
  const { index } = await params;
  return <IndexConstituents index={index} />;
}
