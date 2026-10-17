import type { Metadata } from 'next';
import { InstallContainer } from '@/containers/InstallContainer';

export const metadata: Metadata = { title: 'Get the Certa app', description: 'Install Certa on your phone’s Home Screen or your computer.' };

/** Public: pilots open it from a shared link before they have an account on the device. */
export default function Page() {
  return <InstallContainer />;
}
