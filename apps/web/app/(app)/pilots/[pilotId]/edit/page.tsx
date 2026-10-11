import { PilotFormContainer } from '@/containers/PilotContainers';
export default async function Page({ params }: { params: Promise<{ pilotId: string }> }) {
  const { pilotId } = await params;
  return <PilotFormContainer pilotId={pilotId} />;
}
