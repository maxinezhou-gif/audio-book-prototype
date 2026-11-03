/* Viewing preferences shared by the index and the prototypes.

   Load this in <head>, before anything renders — it sets an attribute on
   <html> that the stylesheets key off, and doing it later would flash the
   wrong state for a frame.

   Stored in localStorage, which is per-device, so a phone and a desktop each
   remember their own answer without either having to know about the other. */

(function () {
  'use strict';

  var KEY = 'app.statusbar';

  /* A phone draws its own status bar, so the fake one is only wanted on a
     desktop-sized window. That is the starting point; the toggle on the index
     overrides it and the choice sticks. */
  function auto() {
    try {
      return !window.matchMedia('(max-width: 440px), (display-mode: standalone)').matches;
    } catch (e) {
      return true;
    }
  }

  function get() {
    try {
      var v = localStorage.getItem(KEY);
      return v === null ? auto() : v === '1';
    } catch (e) {
      return auto();   // private mode, blocked storage — fall back, never throw
    }
  }

  function set(on) {
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch (e) { /* preference just will not persist; the page still works */ }
    apply();
  }

  function apply() {
    document.documentElement.setAttribute('data-statusbar', get() ? 'on' : 'off');
  }

  /* Slow motion — quarter speed for every drag duration, so a reviewer can
     see that the displace and the drop use different easing curves. Off
     unless asked for; it is an inspection aid, not a default. */
  var SLOW_KEY = 'app.slowmotion';

  function getSlow() {
    try {
      return localStorage.getItem(SLOW_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function setSlow(on) {
    try {
      localStorage.setItem(SLOW_KEY, on ? '1' : '0');
    } catch (e) { /* preference just will not persist; the page still works */ }
    applySlow();
  }

  function applySlow() {
    document.documentElement.setAttribute('data-motion-speed', getSlow() ? 'slow' : 'normal');
  }

  apply();
  applySlow();

  window.Prefs = {
    statusBar: get, setStatusBar: set, applyStatusBar: apply,
    slowMotion: getSlow, setSlowMotion: setSlow, applySlowMotion: applySlow
  };
})();
