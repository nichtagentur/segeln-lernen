/* ============================================
   SEGELN LERNEN -- Interactive Widgets
   ============================================ */

(function() {
  'use strict';

  // --- Dark Mode Toggle ---
  const THEME_KEY = 'segeln-lernen-theme';

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
    updateThemeIcon(next);
  }

  function updateThemeIcon(theme) {
    const btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    btn.innerHTML = theme === 'dark'
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }

  // --- Reading Progress Bar ---
  function initProgressBar() {
    const bar = document.querySelector('.progress-bar');
    if (!bar) return;
    window.addEventListener('scroll', function() {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = (window.scrollY / docHeight) * 100;
      bar.style.width = Math.min(scrolled, 100) + '%';
    }, { passive: true });
  }

  // --- Scroll to Top ---
  function initScrollTop() {
    const btn = document.querySelector('.scroll-top');
    if (!btn) return;
    window.addEventListener('scroll', function() {
      btn.classList.toggle('visible', window.scrollY > 500);
    }, { passive: true });
    btn.addEventListener('click', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // --- FAQ Accordion ---
  function initFAQ() {
    document.querySelectorAll('.faq-question').forEach(function(q) {
      q.addEventListener('click', function() {
        const item = q.parentElement;
        const wasOpen = item.classList.contains('open');
        // close all
        document.querySelectorAll('.faq-item.open').forEach(function(i) {
          i.classList.remove('open');
        });
        if (!wasOpen) item.classList.add('open');
      });
    });
  }

  // --- Scroll Animations ---
  function initScrollAnimations() {
    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.fade-in').forEach(function(el) {
      observer.observe(el);
    });
  }

  // --- Mobile Nav Toggle ---
  function initNavToggle() {
    const toggle = document.querySelector('.nav-toggle');
    const links = document.querySelector('.nav-links');
    if (!toggle || !links) return;
    toggle.addEventListener('click', function() {
      links.classList.toggle('open');
      const isOpen = links.classList.contains('open');
      toggle.innerHTML = isOpen
        ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'
        : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>';
    });
  }

  // --- Beaufort Scale Widget ---
  const BEAUFORT_DATA = [
    { name: 'Windstille', kn: '< 1', ms: '0-0.2', wave: '0 m', desc: 'Spiegelglatte See, Rauch steigt senkrecht auf.' },
    { name: 'Leiser Zug', kn: '1-3', ms: '0.3-1.5', wave: '0.1 m', desc: 'Kaum merklicher Wind, kleine Kraeuseln.' },
    { name: 'Leichte Brise', kn: '4-6', ms: '1.6-3.3', wave: '0.2 m', desc: 'Wind im Gesicht spuerbar, Blaetter rascheln.' },
    { name: 'Schwache Brise', kn: '7-10', ms: '3.4-5.4', wave: '0.6 m', desc: 'Blaetter und duenne Zweige bewegen sich. Idealer Anfaengerwind.' },
    { name: 'Maessige Brise', kn: '11-16', ms: '5.5-7.9', wave: '1 m', desc: 'Hebt Staub und Papier. Perfekter Segelwind fuer Geniesser.' },
    { name: 'Frische Brise', kn: '17-21', ms: '8.0-10.7', wave: '2 m', desc: 'Kleine Laubbaeume schwanken. Sportliches Segeln, Reffbereit!' },
    { name: 'Starker Wind', kn: '22-27', ms: '10.8-13.8', wave: '3 m', desc: 'Grosse Aeste bewegen sich. Reffen! Erfahrene Segler geniessen es.' },
    { name: 'Steifer Wind', kn: '28-33', ms: '13.9-17.1', wave: '4 m', desc: 'Ganze Baeume schwanken. Nur fuer erfahrene Crews.' },
    { name: 'Stuermischer Wind', kn: '34-40', ms: '17.2-20.7', wave: '5.5 m', desc: 'Zweige brechen. Hafen anlaufen oder Segel bergen!' },
    { name: 'Sturm', kn: '41-47', ms: '20.8-24.4', wave: '7 m', desc: 'Baeume werden entwurzelt. Schwere See, Hafen aufsuchen!' },
    { name: 'Schwerer Sturm', kn: '48-55', ms: '24.5-28.4', wave: '9 m', desc: 'Schwere Verwuestungen. Nicht rausfahren!' },
    { name: 'Orkanartiger Sturm', kn: '56-63', ms: '28.5-32.6', wave: '11 m', desc: 'Schwerste Sturmschaeden.' },
    { name: 'Orkan', kn: '64+', ms: '32.7+', wave: '14+ m', desc: 'Schwerste Verwuestungen an Land und auf See.' }
  ];

  function initBeaufort() {
    document.querySelectorAll('.widget-beaufort').forEach(function(widget) {
      const slider = widget.querySelector('.beaufort-slider');
      if (!slider) return;

      function update() {
        const val = parseInt(slider.value);
        const data = BEAUFORT_DATA[val];
        widget.querySelector('.beaufort-number').textContent = val;
        widget.querySelector('.beaufort-name').textContent = data.name;
        widget.querySelector('[data-field="wind-kn"]').textContent = data.kn + ' kn';
        widget.querySelector('[data-field="wind-ms"]').textContent = data.ms + ' m/s';
        widget.querySelector('[data-field="wave"]').textContent = data.wave;
        widget.querySelector('.beaufort-desc').textContent = data.desc;

        // Color the number based on severity
        const num = widget.querySelector('.beaufort-number');
        if (val <= 3) num.style.color = '#00b4d8';
        else if (val <= 5) num.style.color = '#0077b6';
        else if (val <= 7) num.style.color = '#ff6b35';
        else num.style.color = '#d00000';
      }

      slider.addEventListener('input', update);
      update();
    });
  }

  // --- Nautical Mile Calculator ---
  function initCalculator() {
    document.querySelectorAll('.widget-calculator').forEach(function(widget) {
      const smInput = widget.querySelector('[data-unit="sm"]');
      const kmInput = widget.querySelector('[data-unit="km"]');
      if (!smInput || !kmInput) return;

      smInput.addEventListener('input', function() {
        const val = parseFloat(smInput.value);
        if (!isNaN(val)) kmInput.value = (val * 1.852).toFixed(2);
        else kmInput.value = '';
      });

      kmInput.addEventListener('input', function() {
        const val = parseFloat(kmInput.value);
        if (!isNaN(val)) smInput.value = (val / 1.852).toFixed(2);
        else smInput.value = '';
      });
    });
  }

  // --- Checklist (localStorage) ---
  function initChecklists() {
    document.querySelectorAll('.checklist').forEach(function(list) {
      const id = list.getAttribute('data-checklist-id') || 'default';
      const key = 'segeln-checklist-' + id;
      var saved = {};
      try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch(e) {}

      list.querySelectorAll('li').forEach(function(li, i) {
        const cb = li.querySelector('input[type="checkbox"]');
        if (!cb) return;
        if (saved[i]) {
          cb.checked = true;
          li.classList.add('checked');
        }
        cb.addEventListener('change', function() {
          li.classList.toggle('checked', cb.checked);
          saved[i] = cb.checked;
          localStorage.setItem(key, JSON.stringify(saved));
        });
      });
    });
  }

  // --- Share Buttons ---
  function initShare() {
    document.querySelectorAll('.share-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        const action = btn.getAttribute('data-share');
        const url = window.location.href;
        const title = document.title;

        if (action === 'native' && navigator.share) {
          navigator.share({ title: title, url: url });
        } else if (action === 'whatsapp') {
          window.open('https://wa.me/?text=' + encodeURIComponent(title + ' ' + url));
        } else if (action === 'email') {
          window.location.href = 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(url);
        } else if (action === 'copy') {
          navigator.clipboard.writeText(url).then(function() {
            btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
            setTimeout(function() {
              btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            }, 2000);
          });
        }
      });
    });
  }

  // --- Init All ---
  function init() {
    initTheme();
    initProgressBar();
    initScrollTop();
    initFAQ();
    initScrollAnimations();
    initNavToggle();
    initBeaufort();
    initCalculator();
    initChecklists();
    initShare();

    // Theme toggle button
    var themeBtn = document.querySelector('.theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
