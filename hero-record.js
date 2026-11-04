/* ============================================================
   Record-a-page hero — the timeline

   The phone is record-book.html running live in an iframe, so this file
   never re-implements the product: it presses the product's own controls
   and lets the app's real transitions play. Three jobs only —

     1. scale the design-pixel stage to whatever width the host gives it
     2. dress the embedded screen (strip the prototype's page chrome,
        park the scroller where the story happens)
     3. run the beats, marking each press with a ripple where it lands

   There is no cursor and no stand-in for one: nothing travels between
   controls. The loop resets by reloading the frame under an opaque seam,
   so the tile is never seen un-recording itself.
   ============================================================ */

(() => {
  'use strict';

  /* Where "Recording" sits in the phone, in device px. Chosen so the stage's
     top edge falls in the gap above the section rather than through the line
     of type above it — a bleed crop may cut filler, never a word. The row
     above ends at 196 and the wide crop starts at 200. */
  const HEADER_Y = 212;
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* How long after the ripple the control is actually pressed. Feedback
     starts on contact and the result follows it, never the other way. */
  const PRESS = 140;

  /* How long the recording runs, press to press. The app's timer is real —
     it counts actual elapsed time — so this is what the sheet ends up
     showing, and the whole loop is paced from it. */
  const REC = 2000;

  const stage = document.getElementById('plStage');
  const frame = document.getElementById('plFrame');
  const tapEl = document.getElementById('plTap');

  let timers = [];
  let doc = null;

  /* ── 1. scale ─────────────────────────────────────────── */

  /* The design size and the phone's placement live in the stylesheet, which
     is also where the compact design overrides them. Read them back rather
     than keeping a second copy here: two sources would drift the first time
     the composition is nudged. */
  const num = (name) => parseFloat(getComputedStyle(stage).getPropertyValue(name)) || 0;

  function fit() {
    stage.style.setProperty('--pl-scale', stage.clientWidth / num('--pl-w'));
  }
  new ResizeObserver(fit).observe(stage);
  fit();

  /* ── 2. dress the embedded screen ─────────────────────── */

  /* The prototype page centres the device on its own backdrop and carries a
     "back to all prototypes" link. Inside the hero the device *is* the page. */
  const OVERRIDES = `
    html, body { margin: 0 !important; padding: 0 !important; background: transparent !important; }
    body { display: block !important; min-height: 0 !important; }
    .back-link { display: none !important; }
    .device { margin: 0 !important; }
    /* Headroom under the list. Without it the scroller's content is shorter
       than its parked scrollTop the moment the empty state is replaced, the
       browser clamps the scroll, and the whole crop slides by ~37px mid-beat.
       The padding is below the fold and behind the sheet, so it is never
       seen — it only stops the clamp. */
    .contents { padding-bottom: 600px !important; }
  `;

  function dress() {
    doc = frame.contentDocument;
    if (!doc) return false;

    if (!doc.getElementById('plOverrides')) {
      const s = doc.createElement('style');
      s.id = 'plOverrides';
      s.textContent = OVERRIDES;
      doc.head.appendChild(s);
    }

    /* The app centres a new tile under the user's finger with
       scrollIntoView. That is right in the product and wrong in a framed
       shot: the camera does not move because a row arrived, and the scroll
       would drag "Recording" and the tile out of the crop mid-beat.
       Neutralised here rather than in app.js — the behaviour belongs in
       the app, it just has no finger to follow inside a hero. */
    frame.contentWindow.Element.prototype.scrollIntoView = function () {};

    /* Park the scroller so "Recording" lands at HEADER_Y. Measured rather
       than hard-coded: the section moves whenever the form above it does. */
    const screenEl = doc.getElementById('screen');
    const header = doc.querySelector('.rec__header');
    if (!screenEl || !header) return false;
    screenEl.scrollTop += header.getBoundingClientRect().top - HEADER_Y;

    return true;
  }

  /* ── the ripple ───────────────────────────────────────── */

  /* Device pixels → stage design pixels. The phone is placed and scaled by
     the stylesheet and both change in the compact design, so every point
     goes through here instead of being written as a stage coordinate. */
  function fromDevice(dx, dy) {
    const s = num('--pl-phone-scale') || 1;
    return {
      x: num('--pl-phone-x') + dx * s,
      y: num('--pl-phone-top') + dy * s
    };
  }

  /* Aimed inside the target but off its words, so the ripple never blooms
     over the label it is pressing. */
  function pointAt(sel, fx = 0.5, fy = 0.5) {
    const el = doc && doc.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return fromDevice(r.left + r.width * fx, r.top + r.height * fy);
  }

  function ripple(sel, fx, fy) {
    const p = pointAt(sel, fx, fy);
    if (!p) return;
    tapEl.style.setProperty('--pl-tx', p.x + 'px');
    tapEl.style.setProperty('--pl-ty', p.y + 'px');
    /* restart the animation: remove, force a reflow, re-add */
    tapEl.removeAttribute('data-tap');
    void tapEl.offsetWidth;
    tapEl.setAttribute('data-tap', '1');
  }

  function tap(sel) {
    const el = doc && doc.querySelector(sel);
    if (el) el.click();
  }

  /* One press: the ripple lands, then the control responds. */
  function pressAt(ms, sel, fx, fy) {
    at(ms, () => ripple(sel, fx, fy));
    at(ms + PRESS, () => tap(sel));
  }

  /* ── 3. the beats ─────────────────────────────────────── */

  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const clearAll = () => { timers.forEach(clearTimeout); timers = []; };

  function run() {
    clearAll();

    /* 1 — press Record Front Page. The tile lands at once; the app holds
           it on screen alone for 800ms before the sheet comes up. */
    pressAt(1200, '#recordFrontBtn', 0.84, 0.62);

    /* 2 — press the dial. The recording runs for two seconds: the waveform
           fills, the timer rolls to 00:02, the dial is a stop square. The
           two seconds are measured press-to-press, so the timer reads what
           actually elapsed rather than a number written in. */
    pressAt(3300, '#dial', 0.5, 0.5);

    /* 3 — stop. The waveform settles to its full shape, the sheet grows,
           the transport and the two actions arrive, and the chip behind the
           scrim turns Unlinked. Then it holds: the frame people screenshot. */
    pressAt(3300 + REC, '#dial', 0.5, 0.5);

    /* 4 — close, so the result is seen where it lives: a tile in the list */
    pressAt(3300 + REC + 2600, '#sheetClose', 0.5, 0.5);

    /* 5 — reset under the seam. Nothing rewinds in view: the frame reloads
           while the stage is opaque, and the next loop opens on frame one. */
    at(3300 + REC + 5200, () => stage.setAttribute('data-seam', '1'));
    at(3300 + REC + 5600, () => frame.contentWindow.location.reload());
  }

  /* Reduced motion: no loop and no ripples. Drive straight to the beat that
     tells the story on its own and stop there — the sheet open on a
     finished recording. The only movement is the app's own waveform
     settling once, and then nothing moves again. */
  function poster() {
    at(100, () => tap('#recordFrontBtn'));
    at(1000, () => tap('#dial'));
    at(2200, () => tap('#dial'));
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
      /* a reset reload: lift the seam only once the screen is dressed and
         parked, so the seam never uncovers an unstyled or unscrolled frame */
      requestAnimationFrame(() => {
        stage.removeAttribute('data-seam');
        at(420, run);
      });
    }
  });

  /* Don't animate a hero nobody is looking at: it burns a timer loop and,
     off screen, the measured rects are the only thing keeping the ripples
     landing where they should. */
  if (!REDUCED && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) clearAll();
        else if (doc && !timers.length) run();
      });
    }, { threshold: 0.2 }).observe(stage);
  }
})();
