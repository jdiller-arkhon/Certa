import { MissionDetailContainer } from '@/containers/MissionContainers';
export default async function Page({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  return <MissionDetailContainer missionId={missionId} />;
}
