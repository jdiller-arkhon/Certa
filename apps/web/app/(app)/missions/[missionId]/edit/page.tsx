import { MissionFormContainer } from '@/containers/MissionContainers';
export default async function Page({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  return <MissionFormContainer missionId={missionId} />;
}
