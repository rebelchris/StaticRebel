'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect old trackers page to skills
export default function Trackers() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/skills');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <p className="text-gray-500">Redirecting to Skills...</p>
        <p className="text-sm text-gray-400 mt-2">
          Trackers have been unified under Skills
        </p>
      </div>
    </div>
  );
}
