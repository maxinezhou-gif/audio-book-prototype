# Pagelark heroes — rehearsal notes

Two marketing heroes, built to the Stageshow rules (framing, craft,
motion). They share one stage system, one geometry and one shadow, so they
read as one figure language on a page.

| | Files | Story | Ground |
|---|---|---|---|
| **Record** | `hero-record.{html,css,js}` | Tap **Record Front Page**, a tile lands, the sheet comes up, a recording finishes | `#f4ead4` |
| **Reorder** | `hero-reorder.{html,css,js}` | Four pages arrive, then the second is held and dragged to the foot of the list | `#fff6e3` |

`hero-record.css` carries the shared stage system — stage, scaler, phone,
shadow, reset seam, compact design. `hero-reorder.css` loads after it and
overrides only the ground colour and adds the drag's contact dot. Change
the geometry in `hero-record.css` and both heroes follow.

Run `python3 serve.py` and open:

- <http://localhost:8787/hero-record.html>
- <http://localhost:8787/hero-reorder.html>

Everything below applies to both unless it says otherwise.

---

## What it is

The phone is **not a rebuild**. `record-book.html` runs live in an iframe at
its true 390 × 844, so the chrome, the sheet, the waveform, the chip states
and every transition are the product's own. `hero-record.js` presses the
product's real controls and lets the app respond; it never re-implements a
single component.

The practical consequence: **if the app changes, the hero follows.** The
only thing that can break it is renaming one of the five things it reaches
for — `#recordFrontBtn`, `#dial`, `#sheetClose`, `#screen`, `.rec__header`.

## The reorder hero's loop — 10.2s

1. An empty Recording section
2. Four pages land one by one, 600ms apart, on the app's own entrance —
   Front page, # 1, # 2, # 3, each on a different status: **Linked**,
   **Unlinked**, **No audio**. The app counts them itself: the secondary
   button reads *Link 1 tag*.
3. A beat with the list complete
4. **# 1 is pressed and held** — the press sits still for 420ms before
   anything moves, so it reads as press, hold, lift rather than a row that
   jumped
5. It travels two rows down over 2.2s while **# 2** and **# 3** slide up to
   make room — the gap follows the row
6. Release. The app's own drop lands it and commits the order
7. **Payoff holds 2.6s**
8. Reset under the seam

### Why the chips carry the payoff, not the names

Page numbers are positional (see the `app.js` change below), so the page
dragged from the second seat to the foot stops being **# 1** and becomes
**# 3**. Which means the list reads the same before and after:

| | row 1 | row 2 | row 3 | row 4 |
|---|---|---|---|---|
| before | Front page · Linked | # 1 · **Linked** | # 2 · **Unlinked** | # 3 · **No audio** |
| after | Front page · Linked | # 1 · **Unlinked** | # 2 · **No audio** | # 3 · **Linked** |

The labels cannot show the move, so the statuses do — all three shift, and
each is a different colour, so the green Linked chip visibly travels from
the second row to the foot. **This is why the four pages are seeded on
three different statuses rather than something tidier.** Give them all the
same chip and the payoff is a list that looks untouched.

The reorder is **not mimicked**. Real `PointerEvent`s are dispatched into
the frame, so the app's own lift → track → displace → drop runs and the
commit is the app's. Verified mid-drag: at the 6s mark `# 1` is carried
117.8px while `# 2` and `# 3` hold `translateY(-60px)` under
`is-displacing`.

The numbers ending up out of sequence (# 2, # 3, # 1) is the point — it is
what makes the change visible. The names are recording labels; the order
is play order.

### How the drag is shown

The row's own lift — scale and shadow, drawn by the app — is what says
"picked up". A **contact dot** appears on the press, rides down with the
row and fades on release. That is a hand holding an object, which is
allowed; what is not is a marker walking between controls, so there is
none between beats.

## Four changes in the product itself

**Revert any of these if you only wanted the heroes changed.**

In `app.js`:

- **Numbered pages are now positional.** `commitMove` calls a new
  `renumber()`, so a page's number follows its seat: drag # 1 to the foot
  of four and it becomes # 3. Front page is skipped and the count starts
  after it. Both reorder paths — pointer drag and the keyboard arrows —
  go through `commitMove`, so both renumber. The screen-reader
  announcement now gives the new name, which is the useful half
  ("Moved to position 4 of 4. Now # 3.").

  This **reverses a documented decision**: the comment that stood there
  argued names should travel with their tile, because renumbering makes a
  swap renumber straight back and the drag appears to have done nothing.
  That cost is real and has been rewritten into the new comment rather
  than dropped — it is what forced the reorder hero onto three distinct
  chips.

- **`window.PagelarkDemo = { addTile, setStatus }`**, added beside the init
  block. The reorder hero needs four tiles without walking the recording
  flow four times, and `addTile` is private to the IIFE. These are the same
  two functions the buttons call — no wrapper, no special path — and
  nothing in the UI uses them, so the app behaves identically whether or
  not anything does. The alternative was replicating the product's tile
  markup inside the hero, which is the one thing worth avoiding: the hero
  would then drift from the component the first time a tile changed.

In `components.css`, both real component bugs rather than framing problems:

- **`.md-sheet` easing** is now `.3s ease-in-out`, was `.3s ease-out`. The
  duration was already 300ms; `ease-out` leaves at full speed, which is
  what made the slide read as a snap.
- **`.md-sheet__cap` gets `margin-bottom: -1px`.** The cap is a 390 × 16
  curve filled with the body's own colour, and its bottom edge met the
  body's top edge at exactly 16px. At any fractional scale — a zoomed page,
  a non-integer DPR, this hero — the two landed either side of a device
  pixel and the scrim showed through as a dark hairline under the curve.
  The overlap costs nothing: the cap's last row is solid fill.

## Design

| | Wide | Compact |
|---|---|---|
| Stage | 600 × 750 | 358 × 600, below 480px |
| Phone | 390 × 844 at 1:1, centred, 17.5% either side | scaled .897, centred |
| Gutters | 105 left, 105 right, 106 foot; top bled | 4 sides, 20 foot; top bled |

The wide stage's height is set so the foot gutter matches the sides rather
than being whatever was left over.

Both scale to the host width from one design, so the composition never
reflows. Colours, type and shape all come from `tokens.css`.

## Placing it

Drop the markup in and link the two files. It fills its container and keeps
its 600 × 750 proportion, so **give it a `max-width`** — its design size is
its best size:

```html
<div style="max-width: 600px; margin: 0 auto;">
  <!-- .pl-hero … -->
</div>
```

It is 600 × 750, so a touch taller than wide.

Below 480px of container width it switches to the compact design on its own.

## Tuning the shadow

<http://localhost:8787/hero-record.html?tune> adds a slider under the hero.
It scales all three shadow layers together and prints the resulting
declaration; paste that over `--pl-shadow-hero` in `hero-record.css` to
keep it. Without `?tune` the page is clean, and the tuner lives in
`hero-record.html` outside `.pl-hero`, so none of it travels with the
component.

## The record hero's loop — 11.3s

1. Rest on the empty Recording section
2. Tap **Record Front Page**
3. The **Front page** tile dissolves in — chip **No audio**
4. Scrim dims, the sheet comes up (the app's own 800ms delay)
5. Tap the dial
6. Records 2s — waveform fills, timer rolls to 00:02
7. Tap stop — waveform settles, the sheet grows, transport and both
   actions arrive, and the chip behind the scrim flips to **Unlinked**
8. **Payoff holds ~2.5s** — the frame people screenshot
9. Tap ×, the sheet drops, the tile is seen where it lives
10. Reset under an opaque seam

## How presses are shown

**No cursor, and no stand-in for one.** Nothing walks between controls — a
travelling ring, halo or spotlight is the thing Stageshow's cursor rules
exist to prevent, and on a touch product an arrow would be a lie anyway.

Instead each press is a **ripple at the point of contact**: it blooms from
0.4× at 55% opacity out to 3.4× as it fades, over 520ms, aimed inside the
control but off its label. The control responds 140ms later, so feedback
starts on contact and the result follows it.

Between presses the frame is the product alone, which is also what keeps
the payoff hold clean.

## Rules this follows deliberately

- **Top bleed, not bottom.** The payoff is the sheet's two actions at the
  bottom of the screen, and a payoff is never sliced. The crop takes the
  status bar and app bar together, landing at device y 200 — the row above
  ends at 196, so no word is cut.
- **No rewind in view.** The frame reloads under the seam; the seam lifts
  only once the screen is dressed and parked.
- **Nothing scrolls because a row arrived.** The app's `scrollIntoView` is
  neutralised in the embed — correct in the product, wrong in a framed shot.
- **`prefers-reduced-motion`** gets no loop and no ripples: it drives to the
  poster beat once and stops.

## Departures, and why

- **Two hardcoded grounds**, `--pl-field: #f4ead4` in `hero-record.css` and
  `#fff6e3` in `hero-reorder.css` — specified directly. No token in
  `tokens.css` carries either value and the Semantic collection has no
  ground or field role they could alias, so borrowing a surface token would
  claim a meaning these fields do not have. Both annotated at the
  declaration. If a ground role is ever added to the library, these are the
  ones to replace.
- **A second hardcoded colour**, `--pl-shadow-ink: 224, 207, 162`
  (`#e0cfa2`) — the drop shadow, specified directly. Same reasoning. The
  library's only shadow, `--elevation-level-2`, is a neutral black at low
  alpha and is what the product itself uses; this one belongs to the hero.
  It is held as an RGB triplet rather than a hex so the three layers can
  set their own alpha. **Tinted shadows need far more alpha than black
  ones** — `#e0cfa2` is only about 20/27/50 steps darker than the ground,
  so at the 5–20% a near-black shadow uses it would be invisible. The
  layers run at **.385 / .595 / .7** — settled by eye on the `?tune`
  slider — and the blur does the softening.
- **The ground is flat.** No gradient, no soft light behind the phone; the
  only depth in the frame is the device's own shadow. Say the word if it
  wants a highlight.
- **The empty state has a large void** under the button at rest, visible
  for the first ~1.2s. That is the product's real empty state and the
  story's premise, so it is left alone rather than faked with filler.

## Checked

- Both heroes at wide (700px) and compact (400px), full loop, including
  the reset seam
- The reorder drag's intermediate state, sampled from the DOM — the lift,
  the travel and the displacing rows are all the app's own
- Renumbering after the drop: the page dragged from the second seat lands
  at the foot as **# 3**
- The timer reads 00:02 at both widths — the app counts real elapsed time,
  so the two seconds are measured press to press rather than written in
- The sheet's top edge at full resolution — the hairline is gone
- Ripple geometry: anchors exactly on the control, scales 0.4 → 3.4 while
  fading, in both designs
- Crop holds steady through every phase — the scroller was clamping when
  the empty state was replaced, shifting the frame 37px mid-beat; fixed
  with headroom under the list rather than by re-parking
- Chip states against `app.js`: **No audio → Unlinked**, not "Linked"
  (linked is only after a tag is attached)
- No sliced words or controls at either width

## Not checked

- **Safari and Firefox.** Chromium only. The iframe corner mask and the
  cap overlap are the two things worth a look.
- **Real devices.** Emulated widths only.
- **Embedded in a host page.** Tested standalone; `hero-record.css` styles
  nothing outside `.pl-hero`, but that is by construction, not by trial.
- **The easing change against the app itself.** `components.css` is shared,
  so the sheet in `record-book.html` now eases both ends too. That is
  almost certainly what you want, but it is a product change, not a hero
  one.
- **Font loading.** The heroes and the iframe both pull Google Fonts; a
  cold cache may show a flash of fallback type on the first frame.
- **Two heroes on one page.** Each runs its own iframe and its own loop;
  they have not been tested side by side, and nothing synchronises them.
- **Renumbering in the app proper**, away from the hero. Only the drag
  path has been exercised; the keyboard arrows go through the same
  `commitMove` and should behave, but have not been tried by hand. Worth
  a minute in `record-book.html` with a few tiles and the arrow keys.
- **The reorder hero's empty opening.** The list starts empty and fills,
  because that is what you asked for. Stageshow would rather a hero opened
  on a screen that already works as a still — if the first second feels
  thin, the alternative is to seed the four pages before frame one and let
  the drag be the whole story.
