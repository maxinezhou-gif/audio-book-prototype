/* ============================================================
   Success animation — three options to compare.

   Option 1  character only, plus the 64-particle confetti burst
   Option 2  character plus the four props, no confetti
   Option 3  both

   The screenshots in Figma are frame-0 stills, so they do not show this:
   option 1 looks bare in a still because its confetti has not fired yet.
   ============================================================ */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const el = {
    list: $('recList'), complete: $('completeBtn'), done: $('doneBtn'),
    success: $('success'), confetti: $('confetti'), optbar: $('optbar'), lottie: $('lottie'), artLottie: $('artLottie'),
    replay: $('replayBtn'), stage: $('success').querySelector('.success__stage')
  };

  /* ── the finished list, as the Figma frame shows it ─────── */
  const TILES = ['Front page', '# 1', '# 2 - Seashell', '# 3', '# 4', '# 5', '# 6', '# 7', '# 8'];

  TILES.forEach((name, i) => {
    const row = document.createElement('div');
    row.className = 'sm-tile ' + (i === 0 ? 'sm-tile--front' : 'sm-tile--numbered');
    row.innerHTML = `
      ${i === 0 ? '' : '<span class="sm-tile__handle" aria-hidden="true"><img src="assets/drag-indicator.svg" alt="" width="20" height="20"></span>'}
      <div class="sm-tile__card">
        <div class="sm-tile__head">
          <span class="sm-tile__main">
            <span class="sm-tile__name">${name}</span>
            <span class="sm-chip sm-chip--linked"><span class="ms">check_circle</span>Linked</span>
          </span>
          <button class="sm-tile__more" aria-label="More options for ${name}"><span class="ms">more_horiz</span></button>
        </div>
      </div>`;
    el.list.appendChild(row);
  });

  /* ── confetti ─────────────────────────────────────────────
     64 particles: 48 strips and 16 dots, four colours, in mirrored
     pairs. Colours, sizes, the fan of angles and the 2.2s fade are the
     Figma values; the burst is driven by one keyframe against per-piece
     custom properties rather than 64 baked translate tracks, which came
     to roughly half a megabyte of CSS for the same result.

     Seeded so every replay is identical — otherwise you would be
     comparing two different bursts, not two options. */

  /* The 64 pieces are Figma's, loaded from success-confetti.js: resting
     position, size, colour and rotation from the frame-0 export, travel and
     scale from the timeline tracks. Nothing here is randomised — the earlier
     version generated its own fan and it was visibly not the same burst. */

  function buildConfetti() {
    const defs = window.CONFETTI || [];
    const frag = document.createDocumentFragment();

    defs.forEach((d) => {
      const p = document.createElement('div');
      p.className = 'success-confetti-piece';
      p.style.cssText =
        `left:${d.l}px;top:${d.t}px;width:${d.w}px;height:${d.h}px;` +
        `background:${d.c};border-radius:${d.dot ? '9999px' : '1.5px'}`;
      p.style.setProperty('--rot', d.rot + 'deg');
      p.style.setProperty('--mx', d.mx + 'px');
      p.style.setProperty('--my', d.my + 'px');
      p.style.setProperty('--ex', d.ex + 'px');
      p.style.setProperty('--ey', d.ey + 'px');
      p.style.setProperty('--s0', d.s0);
      p.style.setProperty('--s1', d.s1);
      frag.appendChild(p);
    });

    el.confetti.innerHTML = '';
    el.confetti.appendChild(frag);
  }

  /* ── options ──────────────────────────────────────────────
     Restarting a CSS animation needs the elements replaced or the
     animation name cleared; rebuilding the confetti and re-adding the
     stage is the simplest way to guarantee every option starts at 0. */

  /* All three are whole-screen exports now, but they draw different amounts of
     the screen, which is what the two flags distinguish:

       actions: true   the export draws the copy but no buttons, so only the
                       real DOM button pair is floated over it.   (option 1)
       copy: true      the export draws the artwork only — no copy, no buttons —
                       so the whole DOM stage comes back, minus its own
                       illustration.                              (options 2, 3)

     Either flag means real buttons are on screen, which is why a tap on the
     art must not dismiss the screen. */
  let option = 1;

  /* Where each option gets its motion. `full` replaces the whole screen;
     `art` drops into the 358x182 slot and leaves the copy and buttons as real
     DOM, which is the only way the three stay comparable. Anything without an
     entry is still the hand-built DOM version. */
  const LOTTIE = {
    1: { full: 'assets/success/option1.json', actions: true },
    2: { full: 'assets/success/option2.json', copy: true },
    3: { full: 'assets/success/option3.json', copy: true }
  };

  /* Keyed by file, not by slot: options 1 and 3 are both whole-screen, so a
     cache keyed on the slot hands back whichever loaded first and silently
     replays the wrong animation. Only one player per container may be live,
     so the previous occupant is destroyed before the next is built. */
  const players = {};
  const occupant = {};

  function player(slot, path, container) {
    if (players[path]) return players[path];
    if (!window.lottie) return null;

    if (occupant[slot] && occupant[slot] !== path) {
      players[occupant[slot]].destroy();
      delete players[occupant[slot]];
      container.innerHTML = '';
    }
    const a = window.lottie.loadAnimation({
      container, renderer: 'svg', loop: false, autoplay: false, path,
      // cover the screen rather than letterbox inside it
      rendererSettings: { preserveAspectRatio: 'xMidYMid slice' }
    });
    if (slot === 'full') a.addEventListener('DOMLoaded', () => fitFullScreen(container));
    players[path] = a;
    occupant[slot] = path;
    return a;
  }

  /* A whole-screen export draws its own status bar. On a device that has a real
     one, two show at once — so crop the export's top 62px by moving the SVG's
     viewBox down, which keeps the rest of the artwork at its proper scale. The
     drawn bar is wanted on a desktop window, where the pref says to show it. */
  const STATUS_H = 62;

  function fitFullScreen(container) {
    const svg = container.querySelector('svg');
    if (!svg) return;
    const drawn = document.documentElement.getAttribute('data-statusbar') === 'on';
    svg.setAttribute('viewBox', drawn ? '0 0 390 844' : `0 ${STATUS_H} 390 ${844 - STATUS_H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  }

  function applyOption() {
    const spec = LOTTIE[option] || {};
    el.success.classList.toggle('is-lottie', !!spec.full);
    el.success.classList.toggle('is-art-lottie', !!spec.art);
    // a full-screen export that draws no buttons needs the real ones floated
    // over it; one that draws its own must not get a second pair
    el.success.classList.toggle('has-lottie-actions', !!spec.actions);
    // ...and one that draws no copy either needs the text back as well
    el.success.classList.toggle('has-lottie-copy', !!spec.copy);
    el.lottie.hidden = !spec.full;
    el.artLottie.hidden = !spec.art;

    document.querySelectorAll('[data-prop]').forEach((p) => { p.style.display = ''; });
    el.confetti.hidden = !!spec.full || !!spec.art || option === 2;

    el.optbar.querySelectorAll('[data-opt]').forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.opt) === option));
    });
  }

  function play() {
    applyOption();
    const spec = LOTTIE[option] || {};

    Object.values(players).forEach((p) => p.goToAndStop(0, true));

    if (spec.full) {
      const p = player('full', spec.full, el.lottie);
      if (p) { fitFullScreen(el.lottie); p.goToAndStop(0, true); p.play(); }
      return;
    }
    if (spec.art) {
      const p = player('art', spec.art, el.artLottie);
      if (p) { p.goToAndStop(0, true); p.play(); }
    }

    if (!spec.art && option !== 2) buildConfetti();

    // force every CSS track back to its first frame
    const stage = el.stage;
    [...stage.querySelectorAll('*'), stage].forEach((n) => {
      const a = n.style.animation;
      n.style.animation = 'none';
      void n.offsetWidth;
      n.style.animation = a || '';
    });
  }

  function openSuccess() {
    el.success.classList.add('is-open');
    el.optbar.hidden = false;
    play();
  }

  function closeSuccess() {
    el.success.classList.remove('is-open');
    el.optbar.hidden = true;
  }

  el.complete.addEventListener('click', openSuccess);
  el.done.addEventListener('click', closeSuccess);
  // only close on tap when the Lottie draws its own Done — with real buttons
  // over it, a stray tap on the art must not dismiss the screen
  el.lottie.addEventListener('click', () => {
    const cl = el.success.classList;
    if (!cl.contains('has-lottie-actions') && !cl.contains('has-lottie-copy')) closeSuccess();
  });
  el.replay.addEventListener('click', play);
  el.optbar.querySelectorAll('[data-opt]').forEach((b) => {
    b.addEventListener('click', () => { option = Number(b.dataset.opt); play(); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.success.classList.contains('is-open')) closeSuccess();
    if (!el.success.classList.contains('is-open')) return;
    if (e.key === '1' || e.key === '2' || e.key === '3') { option = Number(e.key); play(); }
    if (e.key.toLowerCase() === 'r') play();
  });

  applyOption();
})();
