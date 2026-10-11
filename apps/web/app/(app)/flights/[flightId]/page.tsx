import { FlightDetailContainer } from '@/containers/FlightContainers';
export default async function Page({ params }: { params: Promise<{ flightId: string }> }) {
  const { flightId } = await params;
  return <FlightDetailContainer flightId={flightId} />;
}
