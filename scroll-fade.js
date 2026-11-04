/* The scroll-port fade, shared by the three device pages.

   The app bar is opaque, so anything scrolling under it is cut off square.
   Each page hangs a 24px fade off the bar to carry that content out instead.

   The fade cannot simply stay on: at rest the cover sits 4px under the app
   bar, and a fade left on there washes out its top edge. So it is tied to the
   scroller actually being scrolled, through one attribute on <html>, where
   the rest of the shell state already lives.

   Load it with defer: it needs the scroller, not the <head>. */

(function () {
  'use strict';

  function track() {
    var screen = document.querySelector('.screen');
    if (!screen) return;

    function update() {
      document.documentElement.toggleAttribute('data-scrolled', screen.scrollTop > 0);
    }

    screen.addEventListener('scroll', update, { passive: true });
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', track);
  } else {
    track();
  }
})();
