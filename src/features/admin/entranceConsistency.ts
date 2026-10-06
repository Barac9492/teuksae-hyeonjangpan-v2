export const entranceIds = ['space.songrim.access', 'space.songrim.hall', 'space.songrim.gym.f1', 'space.songrim.gym.f2'] as const;
type EntranceReading = { id: string; state: string; version: number; updatedAt: string | null };
/** Compare independently saved readings; an unknown reading makes no claim about access. */
export function entranceWarnings(resources: EntranceReading[]) {
  const stage = resources.find(r => r.id === entranceIds[0])?.state;
  const hall = resources.find(r => r.id === entranceIds[1])?.state;
  const gyms = entranceIds.slice(2).map((id, index) => ({
    label: `체육관 ${index + 1}층`, state: resources.find(r => r.id === id)?.state,
  }));
  const opened = (state?: string) => !!state && ['available', 'busy', 'full'].includes(state);
  const admitting = (state?: string) => state === 'available' || state === 'busy';
  const facilityLabel = (state?: string) => ({ closed: '미개방', available: '이용 가능', busy: '혼잡', full: '입장 마감' }[state ?? ''] ?? '확인 전');
  const warnings: string[] = [];
  if (stage === 'closed' || stage === 'school_open') {
    if (opened(hall)) warnings.push(`입장 단계는 본당 개방 전인데, 본당은 ‘${facilityLabel(hall)}’입니다.`);
    for (const gym of gyms) if (opened(gym.state)) warnings.push(`입장 단계는 체육관 개방 전인데, ${gym.label}은 ‘${facilityLabel(gym.state)}’입니다.`);
  }
  if (stage === 'gym_open') {
    for (const gym of gyms) if (gym.state === 'closed') warnings.push(`입장 단계는 체육관 개방인데, ${gym.label}은 미개방으로 기록되어 있습니다.`);
    if (opened(hall)) warnings.push(`입장 단계는 체육관 먼저 개방인데, 본당은 ‘${facilityLabel(hall)}’입니다.`);
  }
  if (stage === 'hall_open' && (hall === 'closed' || hall === 'full')) warnings.push(`입장 단계는 본당 입장 중인데, 본당은 ‘${facilityLabel(hall)}’입니다.`);
  if (stage === 'hall_closed' && admitting(hall)) warnings.push(`입장 단계는 본당 입장 마감인데, 본당은 ‘${facilityLabel(hall)}’입니다.`);
  return warnings;
}
/** Any changed reading or proposed value requires a new acknowledgement. */
export function entranceFingerprint(resources: EntranceReading[], id: string, state: string, occupancyPercent: number | null) {
  return JSON.stringify([id, state, occupancyPercent, entranceIds.map(key => {
    const r = resources.find(item => item.id === key);
    return r ? [r.id, r.state, r.version, r.updatedAt] : [key, null];
  })]);
}
