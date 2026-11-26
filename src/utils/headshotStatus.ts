import { useEffect, useState } from 'react';

type CdnStatus = 'checking' | 'available' | 'unavailable';

let cachedStatus: CdnStatus | null = null;
const listeners = new Set<(status: CdnStatus) => void>();

function notify(status: CdnStatus) {
  cachedStatus = status;
  listeners.forEach((fn) => fn(status));
}

export function useNbaCdnAvailable(): boolean {
  const [status, setStatus] = useState<CdnStatus>(() => {
    if (cachedStatus) return cachedStatus;
    if (typeof navigator !== 'undefined' && navigator.webdriver) {
      cachedStatus = 'unavailable';
      return 'unavailable';
    }
    return 'checking';
  });

  useEffect(() => {
    if (cachedStatus === 'available' || cachedStatus === 'unavailable') {
      setStatus(cachedStatus);
      return;
    }

    listeners.add(setStatus);

    if (cachedStatus === null) {
      cachedStatus = 'checking';
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.onload = () => notify('available');
      img.onerror = () => notify('unavailable');
      img.src = 'https://cdn.nba.com/headshots/nba/latest/260x190/201939.png';
    }

    return () => {
      listeners.delete(setStatus);
    };
  }, []);

  return status === 'available';
}
