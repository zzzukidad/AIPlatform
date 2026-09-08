/* ============================================================
   Dragon Gas & Plumbing — public site behaviour
   Vanilla JS, no dependencies. Cinematic slideshow + niceties.
   ============================================================ */

(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SLIDE_INTERVAL = 6500; // keep in sync with --hero-interval in CSS

  /* ==========================================================
     Hero slideshow
     ========================================================== */
  var hero = document.querySelector('[data-hero]');
  if (hero) initHero(hero);

  function initHero(root) {
    var slides = Array.prototype.slice.call(root.querySelectorAll('.hero-slide'));
    if (slides.length < 1) return;
    var isStatic = root.hasAttribute('data-hero-static');
    var dots = Array.prototype.slice.call(root.querySelectorAll('[data-hero-dot]'));
    var track = root.querySelector('[data-hero-track]');
    var current = 0;
    var timer = null;
    var hovering = false;
    var inView = true;

    /* --- lazy loading: populate <img>/<source> from data-srcset on demand --- */
    function activateSources(slide) {
      var nodes = slide.querySelectorAll('img[data-src], source[data-srcset], img[data-srcset]');
      Array.prototype.forEach.call(nodes, function (node) {
        if (node.hasAttribute('data-srcset')) {
          node.setAttribute('srcset', node.getAttribute('data-srcset'));
          node.removeAttribute('data-srcset');
        }
        if (node.hasAttribute('data-src')) {
          node.setAttribute('src', node.getAttribute('data-src'));
          node.removeAttribute('data-src');
        }
      });
    }

    // If the template shipped eager data-src attributes, hydrate slide 0 now.
    if (slides[0]) activateSources(slides[0]);

    function goTo(index) {
      if (slides.length < 2) return;
      index = (index + slides.length) % slides.length;
      if (index === current) return;

      var prev = slides[current];
      var next = slides[index];
      current = index;

      prev.classList.remove('is-active');
      prev.setAttribute('aria-hidden', 'true');
      prev.querySelectorAll('a').forEach(function (a) {
        a.setAttribute('tabindex', '-1');
      });

      next.classList.add('is-active');
      next.removeAttribute('aria-hidden');
      next.querySelectorAll('a').forEach(function (a) {
        a.removeAttribute('tabindex');
      });
      activateSources(next);

      // Pre-warm the following slide so the next crossfade is seamless.
      if (slides[index + 1]) activateSources(slides[index + 1]);

      dots.forEach(function (dot, i) {
        dot.classList.toggle('is-active', i === current);
        dot.setAttribute('aria-selected', i === current ? 'true' : 'false');
      });

      restartTimer();
    }

    function nextSlide() { goTo(current + 1); }
    function prevSlide() { goTo(current - 1); }

    /* --- autoplay --- */
    function startTimer() {
      if (isStatic || reducedMotion || slides.length < 2) return;
      stopTimer();
      // restart the CSS progress fill on the active dot
      var dot = dots[current];
      if (dot) {
        dot.classList.remove('is-active');
        void dot.offsetWidth;
        dot.classList.add('is-active');
      }
      timer = window.setInterval(nextSlide, SLIDE_INTERVAL);
    }
    function stopTimer() {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
    }
    function restartTimer() {
      stopTimer();
      // a small grace period after manual navigation feels better
      if (!hovering && inView && !document.hidden) timer = window.setInterval(nextSlide, SLIDE_INTERVAL);
    }
    function updatePlayState() {
      if (hovering || !inView || document.hidden) {
        stopTimer();
        root.classList.remove('is-playing');
      } else {
        startTimer();
        root.classList.add('is-playing');
      }
    }

    if (!isStatic && slides.length > 1) {
      root.classList.add('is-playing');
      startTimer();

      root.addEventListener('mouseenter', function () { hovering = true; updatePlayState(); });
      root.addEventListener('mouseleave', function () { hovering = false; updatePlayState(); });
      document.addEventListener('visibilitychange', updatePlayState);
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          inView = entries[0].isIntersecting;
          updatePlayState();
        }, { threshold: 0.15 }).observe(root);
      }

      /* --- controls --- */
      var prevBtn = root.querySelector('[data-hero-prev]');
      var nextBtn = root.querySelector('[data-hero-next]');
      if (prevBtn) prevBtn.addEventListener('click', prevSlide);
      if (nextBtn) nextBtn.addEventListener('click', nextSlide);
      dots.forEach(function (dot) {
        dot.addEventListener('click', function () {
          goTo(parseInt(dot.getAttribute('data-hero-dot'), 10) || 0);
        });
      });

      /* --- keyboard (works while the hero is on screen) --- */
      document.addEventListener('keydown', function (event) {
        if (!inView) return;
        if (document.hidden) return;
        var tag = (event.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target.isContentEditable) return;
        if (event.key === 'ArrowRight') { nextSlide(); }
        else if (event.key === 'ArrowLeft') { prevSlide(); }
      });

      /* --- touch / pointer swipe --- */
      var startX = 0, startY = 0, tracking = false;
      root.addEventListener('pointerdown', function (event) {
        if (event.pointerType === 'mouse') return;
        tracking = true;
        startX = event.clientX;
        startY = event.clientY;
      });
      root.addEventListener('pointerup', function (event) {
        if (!tracking) return;
        tracking = false;
        var dx = event.clientX - startX;
        var dy = event.clientY - startY;
        if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          if (dx < 0) nextSlide(); else prevSlide();
        }
      });
      root.addEventListener('pointercancel', function () { tracking = false; });
    }
  }

  /* ==========================================================
     Navbar scroll state
     ========================================================== */
  var nav = document.querySelector('[data-nav]');
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('is-scrolled', window.scrollY > 30);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ==========================================================
     Mobile menu
     ========================================================== */
  var toggle = document.querySelector('[data-nav-toggle]');
  var menu = document.querySelector('[data-mobile-menu]');
  if (toggle && menu) {
    var setMenu = function (open) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('menu-open', open);
      if (open) {
        menu.hidden = false;
        requestAnimationFrame(function () { menu.classList.add('is-open'); });
      } else {
        menu.classList.remove('is-open');
        window.setTimeout(function () { menu.hidden = true; }, 300);
      }
    };
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () { setMenu(false); });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') setMenu(false);
    });
  }

  /* ==========================================================
     Scroll reveals
     ========================================================== */
  var revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    if (!('IntersectionObserver' in window) || reducedMotion) {
      revealEls.forEach(function (el) { el.classList.add('in-view'); });
    } else {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
      revealEls.forEach(function (el) { observer.observe(el); });
    }
  }
})();
