// ---------------------------------------------------------------
// Persepolis Construction — shared frontend logic
// Talks to the FastAPI backend. In local dev the frontend (port 5500) and
// backend (port 8000) are different origins, so that case needs an explicit
// URL. In production, nginx serves both the static files and /api/ under
// the same domain, so '' (same-origin, relative) is correct there — hence
// the port check below instead of one hardcoded default for both cases.
// Override PERSEPOLIS_API_BASE explicitly for any other setup.
const API_BASE = window.PERSEPOLIS_API_BASE !== undefined
  ? window.PERSEPOLIS_API_BASE
  : (location.port === '5500' ? 'http://127.0.0.1:8000' : '');

// Escape anything that came from the database (project titles, and
// especially public-submitted testimonials) before it's dropped into
// innerHTML — otherwise a visitor could submit a review containing
// <script> or an onerror handler and have it run in every browser that
// loads the page once it's approved.
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// ---------- Home page: pin the hero statue while the story scrolls ----------
(function initScrollytell() {
  const wrap = document.getElementById('scrollytell');
  const bg = document.getElementById('pinBg');
  if (!wrap || !bg) return; // not on the home page

  function updatePin() {
    const rect = wrap.getBoundingClientRect();
    const vh = window.innerHeight;
    if (rect.top > 0) {
      bg.style.position = 'absolute'; bg.style.top = '0px';
    } else if (rect.bottom < vh) {
      bg.style.position = 'absolute'; bg.style.top = (wrap.offsetHeight - vh) + 'px';
    } else {
      bg.style.position = 'fixed'; bg.style.top = '0px';
    }
  }
  wrap.style.position = 'relative';
  window.addEventListener('scroll', updatePin, { passive: true });
  window.addEventListener('resize', updatePin);
  updatePin();

  const panels = document.querySelectorAll('.story-panel');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('in-view'); });
  }, { threshold: 0.4 });
  panels.forEach((p) => io.observe(p));
})();

// ---------- Apply editable site text (hero copy, contact details, etc.) ----------
(function loadSiteContent() {
  fetch(`${API_BASE}/api/content`)
    .then((res) => { if (!res.ok) throw new Error('Request failed'); return res.json(); })
    .then((items) => {
      const byKey = {};
      items.forEach((item) => { byKey[item.key] = item.value; });

      document.querySelectorAll('[data-content-key]').forEach((el) => {
        const key = el.dataset.contentKey;
        if (byKey[key] === undefined) return;
        el.innerHTML = byKey[key];
        if (key === 'phone' && el.tagName === 'A') el.href = `tel:${byKey.phone.replace(/\s+/g, '')}`;
        if (key === 'email' && el.tagName === 'A') el.href = `mailto:${byKey.email}`;
      });

      // "Call Now" (mobile bar) and WhatsApp links show fixed label text, not the
      // number itself, so they're never a data-content-key target — but they still
      // need to dial/message the real number, so update every one of them here.
      if (byKey.phone) {
        const telValue = byKey.phone.replace(/\s+/g, '');
        const waValue = telValue.replace(/^\+/, '');
        document.querySelectorAll('a[href^="tel:"]').forEach((a) => { a.href = `tel:${telValue}`; });
        document.querySelectorAll('a[href^="https://wa.me/"]').forEach((a) => { a.href = `https://wa.me/${waValue}`; });
      }
    })
    .catch(() => { /* API not reachable — the static copy already in the page stays */ });
})();

// ---------- Render projects from the API into any #project-grid ----------
// Each card shows the project's first photo as a cover (with a photo-count
// badge if there's more than one). Clicking a card opens a lightbox to browse
// every photo of that project, with a thumbnail strip and prev/next.
(function loadProjects() {
  const grid = document.getElementById('project-grid');
  if (!grid) return;

  let projectsData = [];
  let visible = [];

  function ensureLightbox() {
    let box = document.getElementById('pc-lightbox');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'pc-lightbox';
    box.className = 'lightbox-overlay';
    box.innerHTML = `
      <button class="lightbox-nav prev" aria-label="Previous photo">&#8249;</button>
      <div class="lightbox-box">
        <div class="lightbox-head">
          <h3 id="lb-title"></h3>
          <button class="lightbox-close" aria-label="Close">&times;</button>
        </div>
        <div class="lightbox-img-wrap">
          <img id="lb-img" alt="">
          <span id="lb-tag" class="lb-tag"></span>
        </div>
        <div class="lightbox-foot">
          <span id="lb-counter"></span>
          <div class="lightbox-thumbs" id="lb-thumbs"></div>
        </div>
      </div>
      <button class="lightbox-nav next" aria-label="Next photo">&#8250;</button>
    `;
    document.body.appendChild(box);

    let projectIndex = 0;
    let photoIndex = 0;

    function render() {
      const p = visible[projectIndex];
      if (!p || !p.images.length) return;
      const photo = p.images[photoIndex];
      document.getElementById('lb-title').textContent = p.title;
      document.getElementById('lb-img').src = `${API_BASE}${photo.image_path}`;
      document.getElementById('lb-counter').textContent = `${photoIndex + 1} / ${p.images.length}`;
      const tag = document.getElementById('lb-tag');
      if (photo.label === 'gallery') {
        tag.style.display = 'none';
      } else {
        tag.style.display = 'inline-block';
        tag.textContent = photo.label;
        tag.className = `lb-tag lb-tag-${photo.label}`;
      }
      document.getElementById('lb-thumbs').innerHTML = p.images.map((img, i) => `
        <img src="${API_BASE}${img.image_path}" class="lb-thumb-${img.label} ${i === photoIndex ? 'active' : ''}" data-photo="${i}">
      `).join('');
      document.getElementById('lb-thumbs').querySelectorAll('img').forEach((thumb) => {
        thumb.addEventListener('click', () => { photoIndex = Number(thumb.dataset.photo); render(); });
      });
    }
    box.open = (index) => {
      projectIndex = index;
      photoIndex = 0;
      render();
      box.classList.add('open');
    };
    function stepPhoto(delta) {
      const p = visible[projectIndex];
      photoIndex = (photoIndex + delta + p.images.length) % p.images.length;
      render();
    }
    box.querySelector('.lightbox-close').addEventListener('click', () => box.classList.remove('open'));
    box.addEventListener('click', (e) => { if (e.target === box) box.classList.remove('open'); });
    box.querySelector('.prev').addEventListener('click', () => stepPhoto(-1));
    box.querySelector('.next').addEventListener('click', () => stepPhoto(1));
    document.addEventListener('keydown', (e) => {
      if (!box.classList.contains('open')) return;
      if (e.key === 'Escape') box.classList.remove('open');
      if (e.key === 'ArrowLeft') stepPhoto(-1);
      if (e.key === 'ArrowRight') stepPhoto(1);
    });
    return box;
  }

  const lightbox = ensureLightbox();

  function renderGrid(items) {
    visible = items;
    if (!items.length) {
      grid.innerHTML = '<p style="color:var(--ash); grid-column:1/-1;">No projects in this category yet.</p>';
      return;
    }
    grid.innerHTML = items.map((p, i) => {
      const before = p.images.find((img) => img.label === 'before');
      const after = p.images.find((img) => img.label === 'after');
      const cover = before && after
        ? `<div class="pc-split">
            <img class="pc-half pc-before" src="${API_BASE}${before.image_path}" alt="${escapeHtml(p.title)} — before">
            <img class="pc-half pc-after" src="${API_BASE}${after.image_path}" alt="${escapeHtml(p.title)} — after">
           </div>
           <span class="pc-tag pc-tag-before">Before</span>
           <span class="pc-tag pc-tag-after">After</span>`
        : p.images.length
          ? `<img src="${API_BASE}${p.images[0].image_path}" alt="${escapeHtml(p.title)}" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;">`
          : `<div class="ph">project image — before / after</div>`;
      return `
      <div class="project-card ${before && after ? 'has-split' : ''}" data-index="${i}">
        ${cover}
        ${p.images.length > 1 ? `<div class="pc-count">${p.images.length} photos</div>` : ''}
        <div class="frame"><h3>${escapeHtml(p.title)}</h3></div>
      </div>
    `;
    }).join('');

    grid.querySelectorAll('.project-card').forEach((card) => {
      card.addEventListener('click', () => {
        const p = visible[card.dataset.index];
        if (!p.images.length) return;
        lightbox.open(Number(card.dataset.index));
      });
    });
  }

  // ---------- Category filter tabs (projects.html) ----------
  const filterTabs = document.getElementById('filter-tabs');
  if (filterTabs) {
    filterTabs.querySelectorAll('span').forEach((tab) => {
      tab.addEventListener('click', () => {
        filterTabs.querySelectorAll('span').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const category = tab.dataset.category;
        renderGrid(category ? projectsData.filter((p) => p.category === category) : projectsData);
      });
    });
  }

  fetch(`${API_BASE}/api/projects`)
    .then((res) => { if (!res.ok) throw new Error('Request failed'); return res.json(); })
    .then((projects) => {
      if (!projects.length) return; // keep the placeholder markup already in the page
      projectsData = projects;
      renderGrid(projectsData);
    })
    .catch(() => { /* API not reachable yet — the static placeholder cards stay visible */ });
})();

// ---------- Render approved testimonials from the API into any #testi-grid ----------
(function loadTestimonials() {
  const grid = document.getElementById('testi-grid');
  if (!grid) return;

  fetch(`${API_BASE}/api/testimonials`)
    .then((res) => { if (!res.ok) throw new Error('Request failed'); return res.json(); })
    .then((items) => {
      if (!items.length) return;
      grid.innerHTML = items.map((t) => `
        <div class="testi">
          <div class="stars">${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}</div>
          <p>"${escapeHtml(t.text)}"</p>
          <cite>${escapeHtml(t.name)}${t.location ? ', ' + escapeHtml(t.location) : ''}</cite>
        </div>
      `).join('');
    })
    .catch(() => { /* keep static testimonials as fallback */ });
})();

// ---------- Public "leave a review" form submission ----------
document.querySelectorAll('form.review-form').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = form.querySelector('.form-status');
    const submitBtn = form.querySelector('.submit-btn');
    const data = new FormData(form);

    const payload = {
      name: data.get('name') || '',
      location: data.get('location') || '',
      text: data.get('text') || '',
      rating: parseInt(data.get('rating'), 10) || 5,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    if (status) { status.textContent = ''; status.style.color = ''; }

    try {
      const res = await fetch(`${API_BASE}/api/testimonials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Request failed');
      form.reset();
      if (status) {
        status.style.color = 'var(--sand)';
        status.textContent = 'Thanks! Your review will appear once it\'s been checked.';
      }
    } catch (err) {
      if (status) {
        status.style.color = 'var(--red-bright)';
        status.textContent = 'Something went wrong submitting that — please try again shortly.';
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Review';
    }
  });
});
document.querySelectorAll('form.quote-form').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = form.querySelector('.form-status');
    const submitBtn = form.querySelector('.submit-btn');
    const data = new FormData(form);

    const payload = {
      name: data.get('name') || '',
      email: data.get('email') || '',
      phone: data.get('phone') || '',
      project_type: data.get('project_type') || 'Other',
      details: data.get('details') || '',
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    if (status) { status.textContent = ''; status.style.color = ''; }

    try {
      const res = await fetch(`${API_BASE}/api/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Request failed');
      form.reset();
      if (status) {
        status.style.color = 'var(--sand)';
        status.textContent = "Thanks — we'll be in touch within two working days.";
      }
    } catch (err) {
      if (status) {
        status.style.color = 'var(--red-bright)';
        status.textContent = 'Something went wrong sending that — please call or WhatsApp us instead.';
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Request a Quote';
    }
  });
});
