# 우리 illustrative landing

## Scope

The public illustrative home is a frontend-only concept. It leaves the legacy `/app` experience, authentication, database, APIs, and operational status logic untouched.

The home follows four fixed sections in this exact order:

1. `우리 예배`
2. `우리 나눔`
3. `우리 엽서`
4. `우리 사진`

## Honest-data rules

- The event date and today's service schedule remain `추후 안내` until confirmed by the church.
- All four venue states and sample time labels are visibly marked as examples. They are not connected to the production venue-status system.
- Online is explicitly shown as not live and has no simulated broadcast URL.
- Access and parking guidance is illustrative and tells visitors to check the eventual official notice.
- Sharing notices and postcards are fictional examples, not congregant submissions.
- Forms warn against entering real personal concerns, names, schools, contact details, or other personal data.

## Interaction boundaries

- A sharing example is appended only to React component state and disappears on refresh. The success message says it was not sent.
- A postcard example form validates required fields and maximum lengths, then renders one session-only card that can be cleared and disappears on refresh. It creates no profile, count, like, message, or follow-up.
- Photo selection accepts JPG, PNG, or WebP up to 8MB. It creates a browser object URL for local preview only. Replacing, clearing, or unmounting the preview revokes the object URL.
- No interaction in the illustrative home performs a backend call.

## Accessibility and responsive behavior

- The sticky navigation keeps all four section names in one readable row on narrow screens, with the brand on a separate row.
- Venue options are normal buttons with `aria-pressed` state, and all four remain visible together.
- Notice and gallery overlays use native `dialog` when supported, with a non-modal DOM fallback for test environments. They implement Escape close, Tab wrapping, initial focus, and focus return.
- Gallery controls have descriptive accessible names. Illustrations include SVG title/description or labels.
- Motion is removed under `prefers-reduced-motion: reduce`.
- At 320px and 390px, venue options use a readable 2×2 layout. All four states end around 498px from the top; navigation text is 13px and there is no horizontal overflow.

## Image provenance

- The main worship photo is the existing 분당우리교회 March 22, 2026 worship image and is captioned accordingly.
- The existing family image retains its attribution and is explicitly labeled as a reference image, not a photo of our congregants.
- The dawn image is an authored inline SVG and uses no downloaded assets.

## Verification (2026-09-14)

- Production build and lint pass. Full suite: 67/67 tests, 9 files.
- Independent review checked sample labeling, local-only boundaries and modal focus. Same-photo reselection bug fixed with a file input reset and regression assertion.
- A pre-existing macOS case-insensitive module resolution collision between WeGlyph.tsx and weGlyph.ts was corrected by renaming only the component file to WeGlyphView.tsx and updating its import. No legacy behavior or data was changed.
- Illustrative UI approval is separate from church approval or live backend readiness.

## User revision: pre-service packaged sharing and mobile-first (2026-09-14)

- Sharing is explicitly BEFORE worship only. Examples now use individually sealed tea bags and biscuits, not served drinks or post-service fellowship.
- Visible guidelines allow tea bags and individually wrapped candies/snacks/biscuits only, with unopened packaging, use-by dates and allergen labels checked. Homemade/opened foods and poured beverages are excluded. Finish and tidy up before worship starts.
- The local sample-notice form requires acknowledging these guidelines. This is an illustrative interaction, not automated product inspection.
- Artwork depicts sealed tea bags, wrapped candy and packaged biscuits.
- Consolidated mobile CSS under a 1000px breakpoint. First-screen status font: 14px; all four venue buttons end at about 498px from the top at 320/390px viewport widths. No horizontal overflow in either tested layout.
- Mobile imagery/section spacing is reduced (hero photo 220px, two-column compact gallery); 16px form inputs avoid small-input zoom, main buttons are at least 48px high. Tested browser viewport layouts, not physical iOS/Android devices.
- Build, lint and 67/67 tests pass after revision. No remote push or deployment performed.

## Queue-table clarification (2026-09-14)

The actual sharing setting is the table where people wait in line for the main sanctuary. Both illustrative notices now use that setting, not Dream Center or post-service fellowship. Removed the instruction to finish sharing and clean up seats. Retained only packaged-product hygiene/allergen guidance. No layout or backend changes in this revision.
