import { createHash } from 'node:crypto';

// Approved policy: exact literals only.
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
export const PUBLIC_REVIEW_VERSION = 'prayer-public-review-v1';
export function validPublicPrayer(text) {
  return typeof text === 'string' && text.trim().length > 0 && [...text].length <= 600 && !prayerMask(text).required;
}
export function adminPrayerItem(item, supported, editingSupported = false) {
  if (item.kind !== 'prayer' || typeof item.text !== 'string') return item;
  return { ...item, masking: { ...prayerMask(item.text), sourceHash:createHash('sha256').update(item.text).digest('hex'), terms:PRAYER_MASK_TERMS, editingSupported, supported, held: item.publicationHeld === true } };
}
