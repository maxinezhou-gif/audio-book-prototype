/* ============================================================
   Record a book — flow
   Bulk recording: create a page, record it, link it to a tag.

   Flow
     empty ──Record Front Page / Add──▶ tile appears (No audio), 800ms, then sheet
     start ──tap dial──▶ recording starts immediately ──tap dial──▶ recorded
     recorded ──tap dial──▶ listen back ──tap dial──▶ recorded
     recorded ──Record next audio──▶ previous tile becomes Unlinked, new tile + sheet
     dismiss sheet with 2+ unlinked ──▶ bulk actions under the list
   ============================================================ */

(function () {
  'use strict';

  /* ── tuning ───────────────────────────────────────────── */
  const SHEET_DELAY      = 800; // ms the new tile is on screen alone before the sheet
  const SHEET_EXIT       = 320; // must match the .md-sheet transform transition
  const MAX_SECONDS      = 20 * 60;  // the 20:00 ceiling shown in the timer
  const WAVE_FULL_SCALE  = 27;  // seconds of audio that fill the whole waveform

  /* Waveform geometry, read from the Figma "Sound wave" frame
     (211.969 × 29.411, 36 bars). [left, width, height] */
  const WAVE_BARS = [
    [0, 3, 8], [6, 3, 12], [12, 3, 8], [18, 3, 12], [24, 3, 8],
    [30, 2.997, 25.469], [36, 2.997, 11.094], [41.994, 2.997, 23.58],
    [47.992, 2.997, 29.411], [53.989, 2.997, 24.453], [59.986, 2.997, 20.689],
    [65.983, 2.997, 19.872], [71.98, 2.997, 21.172], [77.978, 2.997, 16.726],
    [83.975, 2.997, 10.135], [89.972, 2.997, 20.199], [95.969, 3, 26],
    [101.969, 3, 26], [107.969, 2, 18], [112.969, 3, 18], [118.969, 3, 26],
    [124.969, 3, 18], [130.969, 3, 26], [136.969, 3, 18], [142.969, 3, 18],
    [148.969, 3, 26], [154.969, 3, 18], [160.969, 3, 18], [166.969, 3, 26],
    [172.969, 3, 18], [178.969, 3, 26], [184.969, 3, 8], [190.969, 3, 12],
    [196.969, 3, 8], [202.969, 3, 12], [208.969, 3, 8]
  ];
  const WAVE_H  = 29.411;
  const DOT_H   = 3;     // height of a not-yet-recorded bar

  /* ── elements ─────────────────────────────────────────── */
  const $ = (id) => document.getElementById(id);
  const el = {
    screen: $('screen'),
    emptyNote: $('emptyNote'), recordFrontBtn: $('recordFrontBtn'), addBtn: $('addBtn'),
    fabCreate: $('fabCreate'), seqSwitch: $('seqSwitch'), seqSub: $('seqSub'),
    list: $('recList'), bulk: $('bulkActions'), bulkRecord: $('bulkRecordBtn'), bulkLink: $('bulkLinkBtn'),
    scrim: $('scrim'), sheet: $('sheet'), sheetTitle: $('sheetTitle'), sheetClose: $('sheetClose'),
    stage: $('sheetStage'), wave: $('sheetWave'), hint: $('sheetHint'), timer: $('sheetTimer'),
    undo: $('sheetUndo'), dial: $('dial'), dialInner: $('dialInner'), dialIcon: $('dialIcon'),
    actions: $('sheetActions'), recordNext: $('recordNextBtn'), linkSticker: $('linkStickerBtn'),
    menu: $('tileMenu'), toast: $('toast'), device: $('device'),
    changePhoto: $('changePhotoBtn'), coverImg: $('coverImg'), coverInput: $('coverInput')
  };

  /* ── state ────────────────────────────────────────────── */
  const state = {
    tiles: [],          // { id, name, status, duration, position, expanded }
    activeId: null,
    playingId: null,    // the tile whose inline player is running
    mode: 'closed',     // closed | start | recording | recorded | listen
    elapsed: 0,
    playhead: 0,
    nextNumber: 1
  };
  let ticker = null, sheetTimer = null, tilePlayer = null;

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const activeTile = () => state.tiles.find((t) => t.id === state.activeId) || null;
  const unlinkedCount = () => state.tiles.filter((t) => t.status === 'unlinked').length;

  /* ── waveform ─────────────────────────────────────────── */
  function buildWave() {
    el.wave.innerHTML = '';
    WAVE_BARS.forEach(([left, width], i) => {
      const bar = document.createElement('span');
      bar.className = 'wave__bar';
      bar.style.left = left + 'px';
      bar.style.width = width + 'px';
      bar.dataset.i = String(i);
      el.wave.appendChild(bar);
    });
  }

  /* progress is 0–1; mode decides how far the bars are drawn and coloured */
  function paintWave(mode, progress) {
    const head = progress * WAVE_BARS.length;
    [...el.wave.children].forEach((bar, i) => {
      const [, , fullH] = WAVE_BARS[i];
      let h = fullH, played = false;

      if (mode === 'recording') {
        const reached = i < head;
        // the leading few bars jitter so the level feels live
        const jitter = reached && i > head - 3 ? 0.65 + Math.random() * 0.35 : 1;
        h = reached ? fullH * jitter : DOT_H;
        played = reached;
      } else if (mode === 'listen') {
        played = i < head;
      }

      bar.style.height = h + 'px';
      bar.style.top = ((WAVE_H - h) / 2) + 'px';
      bar.classList.toggle('is-played', played);
    });
  }

  /* ── tiles ────────────────────────────────────────────── */
  const CHIP = {
    'no-audio': { cls: 'sm-chip--no-audio', icon: 'mic',          label: 'No audio' },
    'unlinked': { cls: 'sm-chip--unlinked', icon: 'error',        label: 'Unlinked' },
    'linked':   { cls: 'sm-chip--linked',   icon: 'check_circle', label: 'Linked' }
  };

  const hasAudio = (tile) => tile.status !== 'no-audio' && tile.duration > 0;

  /* Drop the entrance class once the dissolve is done. Without this the element
     leans on animation-fill-mode to hold its final state forever, and anything
     that stops the animation running — a backgrounded tab, a throttled frame —
     leaves the tile parked at 97% and blurred. The timer is the belt: it fires
     even if animationend never does. */
  function settleEntrance(node) {
    const clear = () => node.classList.remove('is-entering');
    node.addEventListener('animationend', clear, { once: true });
    setTimeout(clear, 500);
  }

  function renderTile(tile, animate) {
    const chip = CHIP[tile.status];
    const row = document.createElement('div');
    row.className = 'sm-tile' + (tile.isFront ? ' sm-tile--front' : ' sm-tile--numbered');
    row.dataset.id = tile.id;
    if (animate) row.classList.add('is-entering');

    const handle = tile.isFront ? '' :
      `<span class="sm-tile__handle" role="button" tabindex="0"
             aria-label="Reorder ${tile.name}. Use the up and down arrow keys."
       ><img src="assets/drag-indicator.svg" alt="" width="20" height="20"></span>`;

    row.innerHTML = `
      ${handle}
      <div class="sm-tile__card">
        <div class="sm-tile__head">
          <span class="sm-tile__main">
            <span class="sm-tile__name">${tile.name}</span>
            <span class="sm-chip ${chip.cls}"><span class="ms">${chip.icon}</span>${chip.label}</span>
          </span>
          <button class="sm-tile__more" aria-label="More options for ${tile.name}"><span class="ms">more_horiz</span></button>
        </div>
        <div class="sm-tile__player-wrap">
          <div class="sm-player">
            <div class="sm-player__track-wrap">
              <div class="sm-player__track"></div>
              <img class="sm-player__thumb" src="assets/slider-thumb.svg" alt="" width="12" height="12">
            </div>
            <div class="sm-player__meta">
              <div class="sm-player__times">
                <span data-t="elapsed">00:00</span><span data-t="remaining">-00:00</span>
              </div>
              <div class="sm-player__transport">
                <button class="md-iconbtn md-iconbtn--xs" data-act="back" aria-label="Back 5 seconds"><span class="ms">replay_5</span></button>
                <button class="md-iconbtn md-iconbtn--xs md-iconbtn--tonal" data-act="play" aria-label="Play"><span class="ms">play_arrow</span></button>
                <button class="md-iconbtn md-iconbtn--xs" data-act="fwd" aria-label="Forward 5 seconds"><span class="ms">forward_5</span></button>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    row.querySelector('.sm-tile__more').addEventListener('click', (e) => {
      e.stopPropagation();
      openMenu(tile, e.currentTarget);
    });
    // the whole head row is the expand target — the full width of the tile,
    // not just the name and chip. The overflow button stops propagation, and
    // the player sits outside the row so its controls never collapse the tile.
    const head = row.querySelector('.sm-tile__head');
    head.addEventListener('click', () => { if (hasAudio(tile)) toggleExpand(tile); });
    head.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && hasAudio(tile)) { e.preventDefault(); toggleExpand(tile); }
    });
    row.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.dataset.act === 'play') togglePlay(tile);
        else seek(tile, btn.dataset.act === 'back' ? -5 : 5);
      });
    });

    syncTile(tile, row);
    return row;
  }

  /* ── inline playback ──────────────────────────────────── */
  function rowFor(tile) { return el.list.querySelector(`[data-id="${tile.id}"]`); }

  function syncTile(tile, row) {
    row = row || rowFor(tile);
    if (!row) return;
    const playable = hasAudio(tile);
    const head = row.querySelector('.sm-tile__head');
    head.classList.toggle('sm-tile__head--tappable', playable);
    if (playable) {
      head.setAttribute('role', 'button');
      head.setAttribute('tabindex', '0');
      head.setAttribute('aria-expanded', String(!!tile.expanded));
    } else {
      head.removeAttribute('role');
      head.removeAttribute('tabindex');
      head.removeAttribute('aria-expanded');
    }
    row.classList.toggle('is-expanded', !!(tile.expanded && playable));
    updatePlayer(tile, row);
  }

  function updatePlayer(tile, row) {
    row = row || rowFor(tile);
    if (!row) return;
    const dur = tile.duration || 0;
    const pos = Math.min(tile.position || 0, dur);
    const p = dur ? pos / dur : 0;
    row.querySelector('.sm-player__thumb').style.left = `calc(${p} * (100% - 12px))`;
    row.querySelector('[data-t="elapsed"]').textContent = fmt(pos);
    row.querySelector('[data-t="remaining"]').textContent = '-' + fmt(Math.max(dur - pos, 0));
    const playBtn = row.querySelector('[data-act="play"]');
    const playing = state.playingId === tile.id;
    playBtn.querySelector('.ms').textContent = playing ? 'pause' : 'play_arrow';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  /* one tile open at a time — two players running at once is never wanted */
  function toggleExpand(tile) {
    const opening = !tile.expanded;
    if (state.playingId && (!opening || state.playingId !== tile.id)) stopTilePlayback();
    state.tiles.forEach((t) => { t.expanded = (t === tile) && opening; });
    state.tiles.forEach((t) => syncTile(t));
  }

  function stopTilePlayback() {
    clearInterval(tilePlayer);
    tilePlayer = null;
    const prev = state.tiles.find((t) => t.id === state.playingId);
    state.playingId = null;
    if (prev) updatePlayer(prev);
  }

  function togglePlay(tile) {
    if (state.playingId === tile.id) { stopTilePlayback(); return; }
    stopTilePlayback();
    if ((tile.position || 0) >= tile.duration) tile.position = 0;
    state.playingId = tile.id;
    tilePlayer = setInterval(() => {
      tile.position = Math.min((tile.position || 0) + 0.1, tile.duration);
      updatePlayer(tile);
      if (tile.position >= tile.duration) stopTilePlayback();
    }, 100);
    updatePlayer(tile);
  }

  function seek(tile, delta) {
    tile.position = Math.max(0, Math.min((tile.position || 0) + delta, tile.duration));
    updatePlayer(tile);
  }

  function renderList() {
    el.list.innerHTML = '';
    state.tiles.forEach((t) => el.list.appendChild(renderTile(t, false)));
    el.list.hidden = state.tiles.length === 0;

    const hasTiles = state.tiles.length > 0;
    el.emptyNote.hidden = hasTiles;
    el.recordFrontBtn.hidden = hasTiles;

    syncBulk(false);
  }

  /* The pair under the list. Present whenever there is a list to act on and no
     sheet in the way — not gated on how much has been recorded. What changes
     is the secondary: it counts the recordings still waiting for a tag,
     and goes disabled when there are none, because there is nothing to link.
     The primary stays live either way; recording is how you get out of an
     empty list, so disabling it would be a dead end. */
  function syncBulk(animate) {
    const n = unlinkedCount();
    el.bulkLink.textContent = n === 0 ? 'Link tag'
                            : n === 1 ? 'Link 1 tag'
                            : `Link ${n} tags`;
    el.bulkLink.disabled = n === 0;

    /* Visibility follows the list alone, not the sheet. The sheet is modal and
       covers the bottom of the frame anyway, so hiding the block while it is up
       buys nothing and costs a layout collapse every time one opens. */
    if (state.tiles.length === 0) { el.bulk.hidden = true; return; }

    const wasHidden = el.bulk.hidden;
    el.bulk.hidden = false;
    if (animate && wasHidden) {
      el.bulk.classList.remove('is-entering');
      void el.bulk.offsetWidth;          // restart the animation
      el.bulk.classList.add('is-entering');
      settleEntrance(el.bulk);
    }
  }

  function addTile() {
    const isFront = state.tiles.length === 0;
    const tile = {
      id: 'tile-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      name: isFront ? 'Front page' : `# ${state.nextNumber++}`,
      isFront,
      status: 'no-audio',
      duration: 0,
      position: 0,
      expanded: false
    };
    state.tiles.push(tile);
    state.activeId = tile.id;

    // append with the dissolve rather than re-rendering the whole list,
    // so existing tiles do not flash
    el.emptyNote.hidden = true;
    el.recordFrontBtn.hidden = true;
    el.list.hidden = false;
    // deliberately NOT hiding the bulk block: pulling 128px out of the layout
    // at the moment of the tap collapses the scroller under the user's finger
    // and the smooth scroll below then fights the clamp
    const row = renderTile(tile, true);
    el.list.appendChild(row);
    settleEntrance(row);
    syncBulk(true);   // before the scroll, so the geometry it centres against is final
    // settle the new tile in the middle of the screen rather than jumping to
    // the bottom — it is the thing the user just created, so it should be
    // what they are looking at when the sheet arrives
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return tile;
  }

  function setStatus(tileId, status) {
    const tile = state.tiles.find((t) => t.id === tileId);
    if (!tile) return;
    tile.status = status;
    const row = el.list.querySelector(`[data-id="${tileId}"]`);
    if (!row) return;
    const chip = CHIP[status];
    const node = row.querySelector('.sm-chip');
    node.className = `sm-chip ${chip.cls}`;
    node.innerHTML = `<span class="ms">${chip.icon}</span>${chip.label}`;
    syncTile(tile, row);   // gaining or losing audio changes whether it expands
    syncBulk(false);       // ...and changes how many are waiting for a tag
  }

  /* ── sheet ────────────────────────────────────────────── */
  function sheetTitleFor(tile) {
    return tile.isFront ? 'Front page' : `Recording — ${tile.name.replace(/\s+/g, '')}`;
  }

  function setMode(mode) {
    state.mode = mode;
    const showWave = mode === 'recording' || mode === 'recorded' || mode === 'listen';

    el.stage.hidden = !showWave;
    el.timer.hidden = !showWave;
    el.hint.hidden = showWave;
    // keep the 40px slot in the layout either way — Figma centres the dial
    // between two icon-button slots, so collapsing one shifts it off-centre
    el.undo.style.visibility = (mode === 'recorded' || mode === 'listen') ? 'visible' : 'hidden';
    el.actions.hidden = !(mode === 'recorded' || mode === 'listen');
    el.dial.classList.toggle('is-live', mode === 'recording');

    const icon = { start: 'mic', recording: 'stop', recorded: 'play_arrow', listen: 'pause' }[mode];
    if (icon) el.dialInner.innerHTML = `<span class="ms" id="dialIcon">${icon}</span>`;
    el.dial.setAttribute('aria-label', {
      start: 'Start recording', recording: 'Stop recording',
      recorded: 'Play recording', listen: 'Pause'
    }[mode] || 'Record');

    if (mode === 'recording') paintWave('recording', state.elapsed / WAVE_FULL_SCALE);
    if (mode === 'recorded')  paintWave('recorded', 1);
    if (mode === 'listen')    paintWave('listen', state.playhead / (activeTile().duration || 1));
  }

  function openSheet(tile) {
    state.activeId = tile.id;
    state.elapsed = 0;
    state.playhead = 0;
    el.sheetTitle.textContent = sheetTitleFor(tile);
    el.timer.textContent = `${fmt(0)} / ${fmt(MAX_SECONDS)}`;
    setMode('start');
    el.scrim.classList.add('is-open');
    el.sheet.classList.add('is-open');
    syncBulk(false);   // stays laid out behind the scrim; never collapses
  }

  /* slide the sheet away without drawing any conclusions about the list */
  function hideSheet() {
    stopTicker();
    el.scrim.classList.remove('is-open');
    el.sheet.classList.remove('is-open');
    state.mode = 'closed';
  }

  function closeSheet() {
    clearTimeout(sheetTimer);
    hideSheet();

    // a tile that was opened but never recorded keeps its "No audio" chip
    syncBulk(true);
  }

  function stopTicker() { clearInterval(ticker); ticker = null; }

  /* ── transport ────────────────────────────────────────── */
  function beginRecording() {
    state.elapsed = 0;
    setMode('recording');
    ticker = setInterval(() => {
      state.elapsed += 0.1;
      el.timer.textContent = `${fmt(state.elapsed)} / ${fmt(MAX_SECONDS)}`;
      paintWave('recording', Math.min(state.elapsed / WAVE_FULL_SCALE, 1));
      if (state.elapsed >= MAX_SECONDS) stopRecording();
    }, 100);
  }

  function stopRecording() {
    stopTicker();
    const tile = activeTile();
    tile.duration = Math.max(1, Math.round(state.elapsed));
    tile.position = 0;
    setStatus(tile.id, 'unlinked');
    el.timer.textContent = `${fmt(tile.duration)} / ${fmt(MAX_SECONDS)}`;
    setMode('recorded');
  }

  function startPlayback() {
    const tile = activeTile();
    state.playhead = 0;
    setMode('listen');
    ticker = setInterval(() => {
      state.playhead += 0.1;
      el.timer.textContent = `${fmt(state.playhead)} / ${fmt(tile.duration)}`;
      paintWave('listen', Math.min(state.playhead / tile.duration, 1));
      if (state.playhead >= tile.duration) {
        stopTicker();
        el.timer.textContent = `${fmt(tile.duration)} / ${fmt(MAX_SECONDS)}`;
        setMode('recorded');
      }
    }, 100);
  }

  function pausePlayback() { stopTicker(); setMode('recorded'); }

  el.dial.addEventListener('click', () => {
    if (state.mode === 'start')      beginRecording();
    else if (state.mode === 'recording') stopRecording();
    else if (state.mode === 'recorded')  startPlayback();
    else if (state.mode === 'listen')    pausePlayback();
  });

  el.undo.addEventListener('click', () => {
    stopTicker();
    const tile = activeTile();
    if (state.playingId === tile.id) stopTilePlayback();
    tile.duration = 0;
    tile.position = 0;
    tile.expanded = false;
    setStatus(tile.id, 'no-audio');
    state.elapsed = 0;
    state.playhead = 0;
    el.timer.textContent = `${fmt(0)} / ${fmt(MAX_SECONDS)}`;
    setMode('start');
  });

  /* ── entry points ─────────────────────────────────────── */
  /* The tile is always shown on its own first — the sheet only arrives once
     the user has seen what was added. If a sheet is already up (the
     "Record next audio" path) it slides away before the new tile lands. */
  function startNewRecording() {
    clearTimeout(sheetTimer);
    const wasOpen = state.mode !== 'closed';
    if (wasOpen) hideSheet();
    const tile = addTile();
    sheetTimer = setTimeout(() => openSheet(tile), SHEET_DELAY + (wasOpen ? SHEET_EXIT : 0));
  }

  el.recordFrontBtn.addEventListener('click', startNewRecording);
  el.addBtn.addEventListener('click', startNewRecording);
  el.fabCreate.addEventListener('click', startNewRecording);
  el.recordNext.addEventListener('click', startNewRecording);
  el.bulkRecord.addEventListener('click', startNewRecording);

  el.linkSticker.addEventListener('click', () => {
    toast(`Linking "${activeTile().name}" to a tag — next screen not in this flow`);
  });
  el.bulkLink.addEventListener('click', () => {
    toast(`Linking ${unlinkedCount()} recordings to tags — next screen not in this flow`);
  });

  el.sheetClose.addEventListener('click', closeSheet);
  el.scrim.addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeMenu(); if (state.mode !== 'closed') closeSheet(); }
  });

  /* The supporting line is the only thing that says what the switch actually
     does, so it is part of the state rather than a fixed caption for it. Both
     strings live here, not in the markup, so the two can never drift apart. */
  const SEQ_SUB = {
    on:  "Pages play in sequence. Kids can't skip.",
    off: "Kids can play any page's audio in any order"
  };

  function setSeq(on) {
    el.seqSwitch.setAttribute('aria-checked', String(on));
    el.seqSub.textContent = on ? SEQ_SUB.on : SEQ_SUB.off;
  }

  el.seqSwitch.addEventListener('click', () => {
    setSeq(el.seqSwitch.getAttribute('aria-checked') !== 'true');
  });

  /* The default lives in the markup, so the line is already correct before any
     of this runs and there is no flash on load. Reading it back rather than
     hard-coding `true` keeps one source of truth for the default. */
  setSeq(el.seqSwitch.getAttribute('aria-checked') === 'true');

  /* ── popovers ─────────────────────────────────────────── */

  /* Shared plumbing for the tile overflow and the cover picker. `align` is how
     the menu lines up with its anchor: "end" hangs off the right edge, "center"
     sits under the middle of it. Either way it stays 16 inside the frame. */
  function showMenu(items, anchor, align) {
    el.menu.innerHTML = items.map((it) =>
      `<button class="md-menu-item${it.danger ? ' md-menu-item--danger' : ''}" data-action="${it.label}">
         <span class="ms">${it.icon}</span>${it.label}
       </button>`).join('');

    const box = anchor.getBoundingClientRect();
    const frame = el.device.getBoundingClientRect();
    el.menu.hidden = false;

    const w = el.menu.offsetWidth;
    const raw = align === 'center'
      ? box.left - frame.left + (box.width - w) / 2
      : box.right - frame.left - w;

    el.menu.style.left = Math.round(Math.max(16, Math.min(raw, frame.width - w - 16))) + 'px';
    el.menu.style.top = Math.round(
      Math.min(box.bottom - frame.top + 4, frame.height - el.menu.offsetHeight - 16)
    ) + 'px';

    return el.menu.querySelectorAll('.md-menu-item');
  }

  function openMenu(tile, anchor) {
    const items = tile.status === 'no-audio'
      ? [{ icon: 'edit', label: 'Change name' }, { icon: 'mic', label: 'Record audio' }]
      : [{ icon: 'edit', label: 'Change name' }, { icon: 'mic', label: 'Record again' },
         { icon: 'sell', label: 'Link to a tag' }];
    if (!tile.isFront) items.push({ icon: 'delete', label: 'Delete', danger: true });

    showMenu(items, anchor, 'end').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        closeMenu();
        if (action === 'Delete') {
          if (state.playingId === tile.id) stopTilePlayback();
          state.tiles = state.tiles.filter((t) => t.id !== tile.id);
          renderList();
        } else if (action === 'Record again' || action === 'Record audio') {
          openSheet(tile);
        } else {
          toast(`"${action}" is not part of this flow`);
        }
      });
    });
  }
  /* iOS raises these three from one native sheet; the design asks for them as an
     explicit menu, so they are drawn rather than delegated to the OS. All three
     end at the same file input — "Take a photo" adds `capture` so a phone opens
     the camera rather than the gallery. */
  function openCoverMenu(anchor) {
    const items = [
      { icon: 'photo_library', label: 'Photo library' },
      { icon: 'photo_camera',  label: 'Take a photo' },
      { icon: 'folder',        label: 'Choose file' }
    ];
    anchor.setAttribute('aria-expanded', 'true');
    showMenu(items, anchor, 'center').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeMenu();
        if (btn.dataset.action === 'Take a photo') el.coverInput.setAttribute('capture', 'environment');
        else el.coverInput.removeAttribute('capture');
        el.coverInput.click();
      });
    });
  }

  el.changePhoto.addEventListener('click', (e) => {
    e.stopPropagation();
    if (el.menu.hidden) openCoverMenu(el.changePhoto); else closeMenu();
  });

  let coverUrl = null;
  el.coverInput.addEventListener('change', () => {
    const file = el.coverInput.files && el.coverInput.files[0];
    el.coverInput.value = '';          // so picking the same file twice still fires
    if (!file) return;
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    coverUrl = URL.createObjectURL(file);
    el.coverImg.src = coverUrl;
    // marks the cover as no longer the placeholder — the only thing that reads
    // this is the Change photo button, which steps back to 80% once there is a
    // real picture to look at
    el.coverImg.closest('.cover').classList.add('is-custom');
    toast('Cover updated');
  });

  function closeMenu() {
    el.menu.hidden = true;
    el.changePhoto.setAttribute('aria-expanded', 'false');
  }
  document.addEventListener('click', (e) => {
    if (!el.menu.hidden && !el.menu.contains(e.target)) closeMenu();
  });
  // the menu is placed against the frame, so it would hang in mid-air on scroll
  el.screen.addEventListener('scroll', () => { if (!el.menu.hidden) closeMenu(); });

  /* ── toast ────────────────────────────────────────────── */
  let toastTimer = null;
  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add('is-open');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('is-open'), 2600);
  }

  /* ── drag to reorder ──────────────────────────────────────
     LIFT → TRACK → DISPLACE → DROP. The durations and easings live in
     components.css against --drag-speed; this file owns only the geometry
     and the commit. Front page has no handle and stays pinned at the top,
     so the movable range is every tile after it. */

  const DISPLACE_MS = 180;
  const DROP_MS     = 280;
  const EDGE        = 48;   // px from the scroller edge that starts auto-scroll
  const EDGE_STEP   = 8;    // px per frame once inside that band

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const speed = () => (reduced() ? 0 :
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--drag-speed')) || 1);

  let drag = null;

  function movableRange() {
    // index 0 is Front page when present — it has no handle and cannot move
    const first = state.tiles.findIndex((t) => !t.isFront);
    return { first: first < 0 ? 0 : first, last: state.tiles.length - 1 };
  }

  /* Where row i must sit while `from` is being dragged over `to`. One slot,
     one direction — the gap always follows the finger. */
  function slotOffset(i, from, to, pitch) {
    if (from < to && i > from && i <= to) return -pitch;
    if (from > to && i >= to && i <  from) return  pitch;
    return 0;
  }

  function startDrag(tile, row, startY, pointerId) {
    const rows = [...el.list.children];
    if (rows.length < 2) return;

    // uniform rows make the gap a clean row height, and you cannot scrub and
    // drag at the same time anyway
    if (state.tiles.some((t) => t.expanded)) {
      stopTilePlayback();
      state.tiles.forEach((t) => { t.expanded = false; syncTile(t); });
    }
    closeMenu();

    const pitch = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : row.offsetHeight;
    const from  = state.tiles.indexOf(tile);
    const range = movableRange();

    drag = {
      tile, row, rows, pitch, from, to: from, range,
      startY, dy: 0, pointerId,
      scrollStart: el.screen.scrollTop, raf: 0, edge: 0
    };

    row.classList.add('is-lifted');
    try { row.setPointerCapture?.(pointerId); } catch (e) { /* not a live pointer */ }
  }

  function applyDrag() {
    const d = drag;
    if (!d) return;

    // 2 · TRACK — 1:1, Y only, clamped so the row stays inside the movable band
    const scrolled = el.screen.scrollTop - d.scrollStart;
    const raw = d.dy + scrolled;
    const min = (d.range.first - d.from) * d.pitch;
    const max = (d.range.last  - d.from) * d.pitch;
    const y = Math.max(min, Math.min(max, raw));
    d.row.style.transform = `translateY(${y}px)`;

    // 3 · DISPLACE — a neighbour moves once the lifted row's centre passes its midpoint
    const to = Math.max(d.range.first, Math.min(d.range.last, d.from + Math.round(y / d.pitch)));
    if (to !== d.to) {
      d.to = to;
      d.rows.forEach((r, i) => {
        if (i === d.from) return;
        r.classList.add('is-displacing');
        r.style.transform = `translateY(${slotOffset(i, d.from, to, d.pitch)}px)`;
      });
    }
  }

  function autoScroll() {
    const d = drag;
    if (!d) return;
    if (d.edge) {
      el.screen.scrollTop += d.edge * EDGE_STEP;
      applyDrag();
    }
    d.raf = requestAnimationFrame(autoScroll);
  }

  function endDrag() {
    const d = drag;
    if (!d) return;
    drag = null;
    cancelAnimationFrame(d.raf);

    const settle = () => {
      d.rows.forEach((r) => {
        r.classList.remove('is-lifted', 'is-displacing', 'is-dropping');
        r.style.transform = '';
      });
      commitMove(d.from, d.to);
    };

    // 4 · DROP — travel to the open gap while the shadow fades over the same window
    if (speed() === 0) { settle(); return; }
    d.row.classList.remove('is-lifted');
    d.row.classList.add('is-dropping');
    d.row.style.transform = `translateY(${(d.to - d.from) * d.pitch}px)`;
    setTimeout(settle, DROP_MS * speed());
  }

  function commitMove(from, to) {
    if (from !== to) {
      const [moved] = state.tiles.splice(from, 1);
      state.tiles.splice(to, 0, moved);
      announce(`${moved.name} moved to position ${to + 1} of ${state.tiles.length}`);
    }
    renderList();
  }

  /* Names travel with their tile rather than being renumbered by position.
     Renumbering looks right in the abstract and is wrong in practice: with
     every tile on its default "# n", a swap renumbers straight back and the
     drag appears to have done nothing at all. The label is the recording's
     name; the order is the order. */

  let liveRegion = null;
  function announce(message) {
    if (!liveRegion) {
      liveRegion = document.createElement('p');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.style.cssText =
        'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
      el.list.parentNode.appendChild(liveRegion);
    }
    liveRegion.textContent = message;
  }

  /* keyboard — same displace animation, then commit */
  function nudge(tile, delta) {
    const from = state.tiles.indexOf(tile);
    const range = movableRange();
    const to = Math.max(range.first, Math.min(range.last, from + delta));
    if (to === from) return;

    const rows = [...el.list.children];
    const pitch = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : 0;

    const finish = () => {
      rows.forEach((r) => { r.classList.remove('is-displacing'); r.style.transform = ''; });
      commitMove(from, to);
      const moved = el.list.querySelector(`[data-id="${tile.id}"] .sm-tile__handle`);
      moved?.focus();
    };

    if (speed() === 0) { finish(); return; }
    rows[from].classList.add('is-displacing');
    rows[from].style.transform = `translateY(${(to - from) * pitch}px)`;
    rows.forEach((r, i) => {
      if (i === from) return;
      r.classList.add('is-displacing');
      r.style.transform = `translateY(${slotOffset(i, from, to, pitch)}px)`;
    });
    setTimeout(finish, DISPLACE_MS * speed());
  }

  el.list.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.sm-tile__handle');
    if (!handle || drag) return;
    const row = handle.closest('.sm-tile');
    const tile = state.tiles.find((t) => t.id === row.dataset.id);
    if (!tile || tile.isFront) return;
    e.preventDefault();
    startDrag(tile, row, e.clientY, e.pointerId);
    if (!drag) return;
    drag.raf = requestAnimationFrame(autoScroll);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });

  /* While a drag is live the pointer will leave the list — over the nav bar,
     off the edge of the screen — so these listen on the window rather than
     relying on pointer capture alone. */
  function onMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.dy = e.clientY - drag.startY;

    const box = el.screen.getBoundingClientRect();
    drag.edge = e.clientY < box.top + EDGE ? -1
              : e.clientY > box.bottom - EDGE ? 1 : 0;

    applyDrag();
  }

  function onUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    endDrag();
  }

  el.list.addEventListener('keydown', (e) => {
    const handle = e.target.closest('.sm-tile__handle');
    if (!handle) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const row = handle.closest('.sm-tile');
    const tile = state.tiles.find((t) => t.id === row.dataset.id);
    if (!tile || tile.isFront) return;
    e.preventDefault();
    nudge(tile, e.key === 'ArrowDown' ? 1 : -1);
  });

  /* ── init ─────────────────────────────────────────────── */
  buildWave();
  paintWave('recorded', 1);
  renderList();
})();
