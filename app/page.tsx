'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { restoreSession, getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db/indexeddb';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      try {
        // Initialize database
        await db.init();

        // Try to restore session
        const user = restoreSession();

        if (user) {
          router.push('/dashboard');
        } else {
          router.push('/login');
        }
      } catch (error) {
        console.error('[v0] Auth check error:', error);
        router.push('/login');
      }
    }

    checkAuth();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  );
}
