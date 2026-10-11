import { AircraftDetailContainer } from '@/containers/AircraftContainers';
export default async function Page({ params }: { params: Promise<{ aircraftId: string }> }) {
  const { aircraftId } = await params;
  return <AircraftDetailContainer aircraftId={aircraftId} />;
}
