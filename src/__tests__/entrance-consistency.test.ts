import { describe, expect, it } from 'vitest';
import { entranceWarnings, entranceFingerprint, entranceIds } from '../features/admin/entranceConsistency';
import { isFreshStatus, lastConfirmedText, publicStatusDisclosure, publicSaveDisclosure } from '../features/companion/statusPresentation';
const states = ['checking', 'closed', 'available', 'busy', 'full'];
// Explicit expected incompatible facility states for each progression stage.
const rules: Record<string, { hall: string[]; gym: string[] }> = {
  checking: { hall: [], gym: [] },
  closed: { hall: ['available','busy','full'], gym: ['available','busy','full'] },
  school_open: { hall: ['available','busy','full'], gym: ['available','busy','full'] },
  gym_open: { hall: ['available','busy','full'], gym: ['closed'] },
  hall_open: { hall: ['closed','full'], gym: [] },
  hall_closed: { hall: ['available','busy'], gym: [] },
};
const at = (time: string, day = 5) => Date.parse(`2026-10-${String(day).padStart(2,'0')}T${time}+09:00`);
const readings = (stage: string, hall: string, gym: string) => [stage,hall,gym].map((state,i)=>({id:entranceIds[i],state,version:1,updatedAt:new Date(at('04:00:00')).toISOString()}));
describe('independent entrance readings',()=>{
 for(const [stage,rule] of Object.entries(rules)) for(const hall of states) for(const gym of states) {
  it(`${stage} / hall=${hall} / gym=${gym}`,()=>{
   const input=readings(stage,hall,gym);const before=JSON.stringify(input);
   expect(entranceWarnings(input)).toHaveLength(Number(rule.hall.includes(hall))+Number(rule.gym.includes(gym)));
   expect(JSON.stringify(input)).toBe(before);
  });
 }
 it('does not invent missing facility readings and invalidates acknowledgements on versions or drafts',()=>{
  const input=readings('hall_open','closed','checking');
  expect(entranceWarnings(input.slice(0,1))).toEqual([]);
  const key=entranceFingerprint(input,entranceIds[0],'hall_open',null);
  expect(entranceFingerprint(input.map((r,i)=>i===1?{...r,version:2}:r),entranceIds[0],'hall_open',null)).not.toBe(key);
  expect(entranceFingerprint(input,entranceIds[0],'hall_closed',null)).not.toBe(key);
  expect(entranceFingerprint(input,entranceIds[0],'hall_open',70)).not.toBe(key);
 });
});
describe('public disclosure uses the same event clock',()=>{
 for(const day of [5,6,7,8,9,10]) for(const [time,mode] of [['04:39:59','before'],['04:40:00','worship'],['05:49:59','worship'],['05:50:00','after']] as const) {
  it(`${day} ${time}`,()=>{
   const now=at(time,day), fresh=new Date(now).toISOString();
   expect(publicStatusDisclosure('space',fresh,now)).toContain(mode==='worship'?'예배 중':mode==='after'?'예배 후':'공개 중');
   expect(publicStatusDisclosure('parking',fresh,now)).toContain(mode==='worship'?'예배 중':'공개 중');
   expect(publicSaveDisclosure('space',now).includes('20초')).toBe(mode==='before');
   expect(publicSaveDisclosure('parking',now).includes('20초')).toBe(mode!=='worship');
  });
 }
 it.each([4,11])('does not suspend on non-event day %s',day=>{
  const now=at('04:45:00',day);expect(publicStatusDisclosure('space',new Date(now).toISOString(),now)).toBe('공개 중(최근 확인)');
 });
 it('keeps freshness classification exact and does not treat invalid or future timestamps as fresh',()=>{
  const now=at('04:10:00');
  expect(isFreshStatus(new Date(now-600000).toISOString(),now)).toBe(true);
  expect(isFreshStatus(new Date(now-600001).toISOString(),now)).toBe(false);
  for(const value of [null,'invalid',new Date(now+1).toISOString()]) {expect(isFreshStatus(value,now)).toBe(false);expect(lastConfirmedText(value,now)).toBe('아직 확인 기록 없음');}
  expect(lastConfirmedText(new Date(now-600001).toISOString(),now)).toBe('마지막 확인 03:59 (한국) · 마지막 기록');
  expect(lastConfirmedText('2026-10-03T16:00:00Z',now)).toContain('10. 4.');
 });
});
