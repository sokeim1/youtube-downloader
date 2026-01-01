const el = (id) => document.getElementById(id);

const logoBtn = el('logoBtn');
const installerMsg = el('installerMsg');


if (installerMsg) {
  const p = new URLSearchParams(window.location.search);
  if (p.get('installer') === 'missing') {
    installerMsg.classList.remove('hidden');
    try {
      window.history.replaceState({}, '', window.location.pathname);
    } catch {}
  }
}

if (logoBtn) {
  logoBtn.style.cursor = 'pointer';
  logoBtn.addEventListener('click', () => {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  });
}

const revealEls = document.querySelectorAll('.reveal');
if (revealEls.length) {
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReduced || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('in-view'));
  } else {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in-view');
            obs.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -10% 0px' }
    );

    revealEls.forEach((el) => obs.observe(el));
  }
}
