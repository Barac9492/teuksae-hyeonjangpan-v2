import { useEffect, useState } from 'react';
import { watchServiceClock } from './serviceSchedule';

export function useServiceClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => watchServiceClock(() => setNow(Date.now())), []);
  return now;
}
