import { AdminShell } from '@/components/admin/admin-shell';

/**
 * Shared layout for every admin section.
 *
 * Living in the layout instead of each page means the navigation rail
 * doesn't unmount on route changes — preserving scroll position and
 * skipping a re-render of the gating probe.
 */
export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
