/* ============================================================
   Reorder hero — the timeline

   Four pages arrive, then the second is picked up by its grip and dropped
   at the foot of the list.

   As with the record hero, the phone is record-book.html running live in
   an iframe and nothing here re-implements the product. Two differences:

     · the tiles are seeded through window.PagelarkDemo (app.js), which is
       the app's own addTile — the same function the Add button calls —
       rather than walking the recording flow four times
     · the drag is driven with real PointerEvents dispatched into the
       frame, so the app's own lift → track → displace → drop runs. The
       geometry, the gap that follows the row and the commit are all the
       product's; this file only supplies the finger.
   ============================================================ */

(() => {
  'use strict';

  /* Where "Recording" sits in the phone, in device px — the same crop as
     the record hero, so the two heroes frame the product identically. */
  const HEADER_Y = 212;
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* The four pages, in the order they arrive. The first tile the app makes
     is always Front page; the rest are numbered for you.

     Three different statuses, deliberately. Page numbers are positional
     (app.js, renumber) so a reorder renumbers straight back: the list
     reads "# 1, # 2, # 3" before the drag and after it. The labels cannot
     carry the change, so the chips do — each of the three moves to a
     different row, and each is a different colour. Drop the variety and
     the payoff is a list that looks untouched. */
  const PAGES = [
    { duration: 34, status: 'linked'   },  /* Front page — green  */
    { duration: 51, status: 'linked'   },  /* the one that moves  */
    { duration: 28, status: 'unlinked' },  /* orange              */
    { duration: 0,  status: 'no-audio' }   /* yellow              */
  ];

  const ARRIVE = 600;   // ms between one page landing and the next
  const DRAG_MS = 2200; // how long the row takes to travel, press to release
  const MOVE_BY = 2;    // rows: the second tile goes to the foot of four

  const stage = document.getElementById('plStage');
  const frame = document.getElementById('plFrame');
  const grip  = document.getElementById('plGrip');

  let timers = [];
  let raf = 0;
  let doc = null;
  let win = null;

  /* ── scale ────────────────────────────────────────────── */

  const num = (name) => parseFloat(getComputedStyle(stage).getPropertyValue(name)) || 0;

  function fit() {
    stage.style.setProperty('--pl-scale', stage.clientWidth / num('--pl-w'));
  }
  new ResizeObserver(fit).observe(stage);
  fit();

  /* ── dress the embedded screen ────────────────────────── */

  const OVERRIDES = `
    html, body { margin: 0 !important; padding: 0 !important; background: transparent !important; }
    body { display: block !important; min-height: 0 !important; }
    .back-link { display: none !important; }
    .device { margin: 0 !important; }
    /* Headroom under the list, so the scroller never clamps and slides the
       crop when the list's height changes. */
    .contents { padding-bottom: 600px !important; }
    /* The app focuses the moved row's handle after a drop, which is right
       for a keyboard user and wrong in a picture. */
    .sm-tile__handle:focus,
    .sm-tile__handle:focus-visible { outline: none !important; }
  `;

  function dress() {
    doc = frame.contentDocument;
    win = frame.contentWindow;
    if (!doc || !win) return false;

    if (!doc.getElementById('plOverrides')) {
      const s = doc.createElement('style');
      s.id = 'plOverrides';
      s.textContent = OVERRIDES;
      doc.head.appendChild(s);
    }

    /* The camera does not move because a row arrived or took focus. Both
       are right in the product and wrong in a framed shot. */
    win.Element.prototype.scrollIntoView = function () {};
    const realFocus = win.HTMLElement.prototype.focus;
    win.HTMLElement.prototype.focus = function (opts) {
      return realFocus.call(this, Object.assign({}, opts, { preventScroll: true }));
    };

    return park();
  }

  /* Park the scroller so "Recording" lands at HEADER_Y. Measured, not
     hard-coded: the section moves whenever the form above it does. */
  function park() {
    const screenEl = doc.getElementById('screen');
    const header = doc.querySelector('.rec__header');
    if (!screenEl || !header) return false;
    screenEl.scrollTop += header.getBoundingClientRect().top - HEADER_Y;
    return true;
  }

  /* ── the hand ─────────────────────────────────────────── */

  /* Device pixels → stage design pixels. */
  function fromDevice(dx, dy) {
    const s = num('--pl-phone-scale') || 1;
    return { x: num('--pl-phone-x') + dx * s, y: num('--pl-phone-top') + dy * s };
  }

  function gripTo(dx, dy) {
    const p = fromDevice(dx, dy);
    grip.style.setProperty('--pl-gx', p.x + 'px');
    grip.style.setProperty('--pl-gy', p.y + 'px');
  }

  /* ── the beats ────────────────────────────────────────── */

  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const clearAll = () => {
    timers.forEach(clearTimeout);
    timers = [];
    cancelAnimationFrame(raf);
  };

  /* One page lands, using the app's own addTile and its entrance. */
  function addPage(i) {
    const api = win.PagelarkDemo;
    if (!api) return;
    const tile = api.addTile();
    tile.duration = PAGES[i].duration;
    api.setStatus(tile.id, PAGES[i].status);
  }

  /* A real pointer sequence into the frame, so the app's drag runs rather
     than being mimicked. Y is all the app reads; X is set so the event is
     well formed. */
  function pointer(type, target, x, y) {
    target.dispatchEvent(new win.PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true,
      clientX: x, clientY: y,
      pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1
    }));
  }

  /* Pick up the second tile and carry it MOVE_BY rows down. */
  function dragSecond() {
    const rows = [...doc.querySelectorAll('.sm-tile')];
    if (rows.length < 2) return;

    const row = rows[1];
    const handle = row.querySelector('.sm-tile__handle');
    if (!handle) return;

    const pitch = rows[1].offsetTop - rows[0].offsetTop;
    const r = handle.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y0 = r.top + r.height / 2;
    const total = pitch * MOVE_BY;

    /* press, and hold still for a beat before anything moves: a long press
       reads as press, hold, lift — not as a row that jumped */
    gripTo(x, y0);
    grip.setAttribute('data-hold', '1');
    pointer('pointerdown', handle, x, y0);

    at(420, () => {
      const t0 = performance.now();
      /* travel on the stage's own curve, so the row departs and arrives
         softly rather than running at a constant speed */
      const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

      const step = (now) => {
        const t = Math.min(1, (now - t0) / DRAG_MS);
        const y = y0 + total * ease(t);
        pointer('pointermove', win, x, y);
        gripTo(x, y);
        if (t < 1) { raf = requestAnimationFrame(step); return; }

        /* release — the app runs its own drop and commits the new order */
        pointer('pointerup', win, x, y);
        grip.setAttribute('data-hold', '0');
      };
      raf = requestAnimationFrame(step);
    });
  }

  function run() {
    clearAll();
    grip.removeAttribute('data-hold');

    /* 1 — the pages arrive, one by one, each on the app's own entrance */
    PAGES.forEach((_, i) => at(1000 + i * ARRIVE, () => addPage(i)));

    const settled = 1000 + PAGES.length * ARRIVE;

    /* 2 — a beat with the list complete, before anything is touched */
    at(settled + 800, dragSecond);

    /* 3 — the payoff: the reordered list, held. The drop is the app's own,
           so the row lands and the others close up behind it. */

    /* 4 — reset under the seam. Nothing rewinds in view: the frame reloads
           while the stage is opaque, and the next loop opens on an empty
           list again. */
    const end = settled + 800 + 420 + DRAG_MS + 2600;
    at(end, () => stage.setAttribute('data-seam', '1'));
    at(end + 400, () => win.location.reload());
  }

  /* Reduced motion: no loop, no hand. Seed the four pages in their final
     order and stop — the still is a book with its pages in place. */
  function poster() {
    PAGES.forEach((_, i) => addPage(i));
  }

  /* ── wiring ───────────────────────────────────────────── */

  let first = true;

  frame.addEventListener('load', () => {
    if (!dress()) return;

    if (REDUCED) { if (first) poster(); first = false; return; }

    if (first) {
      first = false;
      run();
    } else {
      requestAnimationFrame(() => {
        stage.removeAttribute('data-seam');
        at(420, run);
      });
    }
  });

  if (!REDUCED && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) clearAll();
        else if (doc && !timers.length) run();
      });
    }, { threshold: 0.2 }).observe(stage);
  }
})();
