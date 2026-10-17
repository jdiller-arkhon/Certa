import { LogFlightContainer } from '@/containers/FlightContainers';
export default async function Page({ searchParams }: { searchParams: Promise<{ mission?: string }> }) {
  const { mission } = await searchParams;
  // Only a well-formed id is passed on; anything else opens a plain form.
  return <LogFlightContainer missionId={mission && /^[0-9a-f-]{36}$/i.test(mission) ? mission : undefined} />;
}
