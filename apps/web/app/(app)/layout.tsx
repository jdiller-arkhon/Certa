import type { ReactNode } from 'react';
import { AuthenticatedLayout } from '@/containers/AuthenticatedLayout';
export default function Layout({ children }: { children: ReactNode }) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
