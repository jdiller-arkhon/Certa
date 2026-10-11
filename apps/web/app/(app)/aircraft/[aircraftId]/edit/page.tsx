import { AircraftFormContainer } from '@/containers/AircraftContainers';
export default async function Page({ params }: { params: Promise<{ aircraftId: string }> }) {
  const { aircraftId } = await params;
  return <AircraftFormContainer aircraftId={aircraftId} />;
}
