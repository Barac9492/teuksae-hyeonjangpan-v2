import { createHash } from 'node:crypto';

// Proposed policy: review this complete list before deployment. Exact literals only.
// Changing the list changes the version and requires a matching SQL migration.
export const PRAYER_MASK_TERMS = Object.freeze([
  '자살', '강간', '폭행', '자해', '극단적 선택',
  '성폭행', '성폭력', '강제추행', '살인', '살해',
]);
export const PRAYER_MASK_VERSION = `prayer-mask-v1-${createHash('sha256').update(JSON.stringify(PRAYER_MASK_TERMS)).digest('hex').slice(0, 16)}`;
const pattern = [...PRAYER_MASK_TERMS].sort((a, b) => b.length - a.length).join('|');
export function prayerMask(text) {
  const matches = [...text.matchAll(new RegExp(pattern, 'g'))].map(match => ({ start: match.index, end: match.index + match[0].length, term: match[0] }));
  return { required: matches.length > 0, publicText: text.replace(new RegExp(pattern, 'g'), '**'), policyVersion: PRAYER_MASK_VERSION, matches };
}
export function adminPrayerItem(item, supported) {
  if (item.kind !== 'prayer' || typeof item.text !== 'string') return item;
  return { ...item, masking: { ...prayerMask(item.text), supported, held: item.publicationHeld === true } };
}
