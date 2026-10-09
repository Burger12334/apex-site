import { useEffect, useState } from 'react';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// True while the visitor is scrolling down the page (so the header can drop away) and false again
// as soon as they scroll back up or are near the top. Also keeps --scroll (0 to 1) on <html> for the progress line.
export function useHideOnScroll() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    // Scroll events already arrive at most once per frame, so this runs directly.
    const update = () => {
      const y = window.scrollY; const max = document.documentElement.scrollHeight - window.innerHeight;
      document.documentElement.style.setProperty('--scroll', String(max > 0 ? Math.min(1, y / max) : 0));
      if (Math.abs(y - last) < 6) return;
      setHidden(y > last && y > 140);
      last = y;
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => window.removeEventListener('scroll', update);
  }, []);
  return hidden;
}

const REVEAL_TARGETS = '.section-header, .app-card, .team-member, .strip-item, .report-callout, .staff-card, .review-grid > li, .my-report, .community-band .site-width > *, .apply-side, .question-block';

// Sections and cards slide up into place the first time they scroll into view. The hiding class is only
// added by this script, so the page is fully visible without JavaScript and for visitors who prefer less motion.
export function useScrollReveal() {
  useEffect(() => {
    if (reducedMotion() || !('IntersectionObserver' in window)) return;
    const seen = new WeakSet<Element>();
    const watcher = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('in-view'); watcher.unobserve(entry.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    const scan = () => {
      document.querySelectorAll('main ' + REVEAL_TARGETS.split(', ').join(', main ')).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        // Anything already on screen stays put; only content further down animates in.
        if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
        const index = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
        (el as HTMLElement).style.setProperty('--reveal-delay', `${(index % 6) * 70}ms`);
        el.classList.add('reveal');
        watcher.observe(el);
      });
    };
    let queued = false;
    const changes = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; scan(); }); } });
    changes.observe(document.body, { childList: true, subtree: true });
    scan();
    return () => { watcher.disconnect(); changes.disconnect(); };
  }, []);
}
