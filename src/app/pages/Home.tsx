/**
 * Home.tsx — Root route dispatcher.
 * Branches on session: authenticated users see the Landing splash;
 * guests see the Wongsuriya demo tree in place (URL stays "/").
 */

import { useSession } from '@app/hooks/useSession';
import { Landing } from './Landing';
import { TreeView } from './TreeView';

export function Home() {
  const { user, loading } = useSession();

  if (loading) {
    // Minimal neutral placeholder — no spinner to avoid flash of loading UI.
    return (
      <div
        style={{ minHeight: '100vh', background: 'var(--bg, #faf8f4)' }}
        aria-busy="true"
      />
    );
  }

  return user ? <Landing /> : <TreeView treeSlug="wongsuriya" />;
}
