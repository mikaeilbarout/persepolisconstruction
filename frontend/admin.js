// See script.js for why this isn't one hardcoded default — local dev
// (frontend :5500, backend :8000) and production (nginx, same origin for
// both) need different fallbacks.
const API_BASE = window.PERSEPOLIS_API_BASE !== undefined
  ? window.PERSEPOLIS_API_BASE
  : (location.port === '5500' ? 'http://127.0.0.1:8000' : '');
let TOKEN = sessionStorage.getItem('persepolis_admin_token') || null;

// Escape anything rendered via innerHTML that a member of the public
// submitted (quote requests, testimonials) — this panel holds the admin's
// session token, so unescaped user input here is a direct path to session
// hijacking, not just a cosmetic bug.
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const loginScreen = document.getElementById('login-screen');
const forgotScreen = document.getElementById('forgot-screen');
const resetScreen = document.getElementById('reset-screen');
const adminApp = document.getElementById('admin-app');

function authHeaders() {
  return { Authorization: `Bearer ${TOKEN}` };
}

function hideAllScreens() {
  loginScreen.style.display = 'none';
  forgotScreen.style.display = 'none';
  resetScreen.style.display = 'none';
  adminApp.style.display = 'none';
}

function showApp() {
  hideAllScreens();
  adminApp.style.display = 'block';
  loadQuotes();
  loadProjects();
  loadTestimonials();
  loadContent();
  loadAccount();
}

function showLogin() {
  hideAllScreens();
  loginScreen.style.display = 'block';
}

function showForgot() {
  hideAllScreens();
  forgotScreen.style.display = 'block';
}

// ---------- Login ----------
document.getElementById('login-btn').addEventListener('click', async () => {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorBox = document.getElementById('login-error');
  errorBox.textContent = '';
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error('Invalid credentials');
    const data = await res.json();
    TOKEN = data.access_token;
    sessionStorage.setItem('persepolis_admin_token', TOKEN);
    showApp();
  } catch (err) {
    errorBox.textContent = 'Incorrect username or password.';
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  TOKEN = null;
  sessionStorage.removeItem('persepolis_admin_token');
  showLogin();
});

// ---------- Forgot / reset password ----------
document.getElementById('show-forgot-btn').addEventListener('click', showForgot);
document.getElementById('back-to-login-btn').addEventListener('click', showLogin);

document.getElementById('forgot-btn').addEventListener('click', async () => {
  const username = document.getElementById('forgot-username').value.trim();
  const msg = document.getElementById('forgot-message');
  msg.textContent = '';
  if (!username) { msg.textContent = 'Enter your username.'; return; }
  try {
    const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    msg.style.color = 'var(--sand)';
    msg.textContent = data.message;
  } catch (err) {
    msg.style.color = 'var(--red-bright)';
    msg.textContent = 'Something went wrong — try again shortly.';
  }
});

document.getElementById('reset-btn').addEventListener('click', async () => {
  const token = new URLSearchParams(window.location.search).get('reset_token');
  const newPassword = document.getElementById('reset-new-password').value;
  const msg = document.getElementById('reset-message');
  msg.textContent = '';
  if (!newPassword || newPassword.length < 6) {
    msg.style.color = 'var(--red-bright)';
    msg.textContent = 'Password must be at least 6 characters.';
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password: newPassword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Reset failed');
    msg.style.color = 'var(--sand)';
    msg.textContent = data.message + ' Redirecting to sign in…';
    setTimeout(() => {
      window.history.replaceState({}, '', window.location.pathname);
      showLogin();
    }, 1500);
  } catch (err) {
    msg.style.color = 'var(--red-bright)';
    msg.textContent = err.message;
  }
});

// ---------- Boot: show the reset-password screen if a reset_token is in the URL ----------
const urlResetToken = new URLSearchParams(window.location.search).get('reset_token');
if (urlResetToken) {
  hideAllScreens();
  resetScreen.style.display = 'block';
}

// ---------- Tabs ----------
document.querySelectorAll('.admin-tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-tabs button').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.panel}`).classList.add('active');
  });
});

// ---------- Quotes ----------
async function loadQuotes() {
  const list = document.getElementById('quotes-list');
  list.innerHTML = 'Loading…';
  try {
    const res = await fetch(`${API_BASE}/api/quotes`, { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) return showLogin();
    const quotes = await res.json();
    if (!quotes.length) { list.innerHTML = '<p style="color:var(--ash)">No quote requests yet.</p>'; return; }
    list.innerHTML = quotes.map((q) => `
      <div class="admin-card" data-id="${q.id}">
        <div class="row">
          <div>
            <h3>${escapeHtml(q.name)} <span class="status-pill status-${q.status}">${q.status}</span></h3>
            <div class="meta">${escapeHtml(q.email)} · ${escapeHtml(q.phone)} · ${escapeHtml(q.project_type)}</div>
            <p>${escapeHtml(q.details) || '—'}</p>
          </div>
          <div class="admin-actions">
            <select class="status-select" data-quote-id="${q.id}">
              ${['new', 'contacted', 'quoted', 'won', 'lost'].map((s) => `<option value="${s}" ${s === q.status ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
            <button class="btn-sm danger" data-delete-quote="${q.id}">Delete</button>
          </div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.status-select').forEach((sel) => {
      sel.addEventListener('change', async () => {
        await fetch(`${API_BASE}/api/quotes/${sel.dataset.quoteId}`, {
          method: 'PATCH',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: sel.value }),
        });
        loadQuotes();
      });
    });
    list.querySelectorAll('[data-delete-quote]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this quote request?')) return;
        await fetch(`${API_BASE}/api/quotes/${btn.dataset.deleteQuote}`, { method: 'DELETE', headers: authHeaders() });
        loadQuotes();
      });
    });
  } catch (err) {
    list.innerHTML = `<p style="color:var(--red-bright)">Could not reach the API at ${API_BASE}.</p>`;
  }
}

// ---------- Projects ----------
async function loadProjects() {
  const list = document.getElementById('projects-list');
  list.innerHTML = 'Loading…';
  try {
    const res = await fetch(`${API_BASE}/api/projects/admin/all`, { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) return showLogin();
    const projects = await res.json();
    if (!projects.length) { list.innerHTML = '<p style="color:var(--ash)">No projects yet — add one above.</p>'; return; }
    const LABELS = ['before', 'after', 'gallery'];
    const LABEL_TEXT = { before: 'Before', after: 'After', gallery: 'Gallery' };

    list.innerHTML = projects.map((p) => `
      <div class="admin-card" data-id="${p.id}">
        <div class="row">
          <div>
            <h3>${escapeHtml(p.title)}</h3>
            <div class="meta">${escapeHtml(p.category)} · ${escapeHtml(p.location) || 'no location set'} · ${p.is_published ? 'published' : 'hidden'}</div>
            <p>${escapeHtml(p.description) || '—'}</p>
          </div>
          <div class="admin-actions">
            <select class="upload-label-select" data-upload-label="${p.id}">
              ${LABELS.map((l) => `<option value="${l}">Add as: ${LABEL_TEXT[l]}</option>`).join('')}
            </select>
            <label class="btn-sm" style="cursor:pointer;">
              + Add Photos
              <input type="file" accept="image/*" multiple style="display:none" data-upload="${p.id}">
            </label>
            <button class="btn-sm" data-toggle-publish="${p.id}" data-published="${p.is_published}">
              ${p.is_published ? 'Unpublish' : 'Publish'}
            </button>
            <button class="btn-sm danger" data-delete-project="${p.id}">Delete</button>
          </div>
        </div>
        ${p.images.length ? `
          <div class="photo-strip">
            ${p.images.map((img) => `
              <div class="photo-thumb label-${img.label}">
                <img src="${API_BASE}${img.image_path}" alt="">
                <button class="photo-remove" data-delete-image="${p.id}" data-image-id="${img.id}" aria-label="Remove photo">&times;</button>
                <select class="photo-label-select" data-relabel-project="${p.id}" data-relabel-image="${img.id}">
                  ${LABELS.map((l) => `<option value="${l}" ${l === img.label ? 'selected' : ''}>${LABEL_TEXT[l]}</option>`).join('')}
                </select>
              </div>
            `).join('')}
          </div>
        ` : '<p style="color:var(--ash); font-size:13px; margin-top:14px;">No photos yet — add some above.</p>'}
      </div>
    `).join('');

    list.querySelectorAll('[data-upload]').forEach((input) => {
      input.addEventListener('change', async () => {
        if (!input.files.length) return;
        const labelSelect = list.querySelector(`[data-upload-label="${input.dataset.upload}"]`);
        const form = new FormData();
        [...input.files].forEach((file) => form.append('files', file));
        form.append('label', labelSelect.value);
        await fetch(`${API_BASE}/api/projects/${input.dataset.upload}/images`, {
          method: 'POST',
          headers: authHeaders(),
          body: form,
        });
        loadProjects();
      });
    });
    list.querySelectorAll('[data-delete-image]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await fetch(`${API_BASE}/api/projects/${btn.dataset.deleteImage}/images/${btn.dataset.imageId}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        loadProjects();
      });
    });
    list.querySelectorAll('[data-relabel-image]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        await fetch(`${API_BASE}/api/projects/${sel.dataset.relabelProject}/images/${sel.dataset.relabelImage}`, {
          method: 'PUT',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: sel.value }),
        });
        loadProjects();
      });
    });
    list.querySelectorAll('[data-toggle-publish]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nowPublished = btn.dataset.published === 'true';
        await fetch(`${API_BASE}/api/projects/${btn.dataset.togglePublish}`, {
          method: 'PUT',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_published: !nowPublished }),
        });
        loadProjects();
      });
    });
    list.querySelectorAll('[data-delete-project]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this project?')) return;
        await fetch(`${API_BASE}/api/projects/${btn.dataset.deleteProject}`, { method: 'DELETE', headers: authHeaders() });
        loadProjects();
      });
    });
  } catch (err) {
    list.innerHTML = `<p style="color:var(--red-bright)">Could not reach the API at ${API_BASE}.</p>`;
  }
}

document.getElementById('project-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  await fetch(`${API_BASE}/api/projects`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: data.get('title'),
      category: data.get('category'),
      location: data.get('location') || '',
      description: data.get('description') || '',
    }),
  });
  e.target.reset();
  loadProjects();
});

// ---------- Testimonials ----------
async function loadTestimonials() {
  const list = document.getElementById('testimonials-list');
  list.innerHTML = 'Loading…';
  try {
    const res = await fetch(`${API_BASE}/api/testimonials/admin/all`, { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) return showLogin();
    const items = await res.json();
    if (!items.length) { list.innerHTML = '<p style="color:var(--ash)">No testimonials yet — add one above.</p>'; return; }
    list.innerHTML = items.map((t) => `
      <div class="admin-card" data-id="${t.id}">
        <div class="row">
          <div>
            <h3>${escapeHtml(t.name)} <span class="status-pill ${t.is_approved ? 'status-won' : 'status-new'}">${t.is_approved ? 'approved' : 'pending'}</span></h3>
            <div class="meta">${escapeHtml(t.location) || ''} · ${'★'.repeat(t.rating)}</div>
            <p>"${escapeHtml(t.text)}"</p>
          </div>
          <div class="admin-actions">
            <button class="btn-sm" data-toggle-approve="${t.id}" data-approved="${t.is_approved}">
              ${t.is_approved ? 'Unapprove' : 'Approve'}
            </button>
            <button class="btn-sm danger" data-delete-testimonial="${t.id}">Delete</button>
          </div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-toggle-approve]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nowApproved = btn.dataset.approved === 'true';
        await fetch(`${API_BASE}/api/testimonials/${btn.dataset.toggleApprove}`, {
          method: 'PUT',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_approved: !nowApproved }),
        });
        loadTestimonials();
      });
    });
    list.querySelectorAll('[data-delete-testimonial]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this testimonial?')) return;
        await fetch(`${API_BASE}/api/testimonials/${btn.dataset.deleteTestimonial}`, { method: 'DELETE', headers: authHeaders() });
        loadTestimonials();
      });
    });
  } catch (err) {
    list.innerHTML = `<p style="color:var(--red-bright)">Could not reach the API at ${API_BASE}.</p>`;
  }
}

document.getElementById('testimonial-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  await fetch(`${API_BASE}/api/testimonials/admin`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: data.get('name'),
      location: data.get('location') || '',
      text: data.get('text'),
      rating: parseInt(data.get('rating'), 10),
      is_approved: true,
    }),
  });
  e.target.reset();
  loadTestimonials();
});

// ---------- Site content (editable text) ----------
// Long fields render as a textarea, short ones as a single-line input.
const LONG_CONTENT_KEYS = new Set([
  'hero_heading', 'hero_description', 'about_intro', 'footer_copyright',
  'faq1_answer', 'faq2_answer', 'faq3_answer', 'faq4_answer',
]);

// Purely a display grouping for this panel — the API just returns a flat
// list of key/value rows, so this is what keeps 17+ fields from reading as
// one long undifferentiated list. Any key not listed here still shows, just
// under "Other" at the end, so a newly-added content key never disappears.
const CONTENT_GROUPS = [
  { title: 'Home — Hero', keys: ['hero_eyebrow', 'hero_heading', 'hero_description'] },
  { title: 'Contact Info', keys: ['phone', 'email', 'coverage_area', 'office_hours'] },
  { title: 'About Page', keys: ['about_intro'] },
  {
    title: 'FAQ',
    pairs: [
      ['faq1_question', 'faq1_answer'],
      ['faq2_question', 'faq2_answer'],
      ['faq3_question', 'faq3_answer'],
      ['faq4_question', 'faq4_answer'],
    ],
  },
  { title: 'Footer', keys: ['footer_copyright'] },
];

function renderContentField(item) {
  const isLong = LONG_CONTENT_KEYS.has(item.key);
  const fieldHtml = isLong
    ? `<textarea data-key="${item.key}">${escapeHtml(item.value)}</textarea>`
    : `<input type="text" data-key="${item.key}" value="${escapeHtml(item.value)}">`;
  return `
    <div class="content-field">
      <label>${item.label || item.key}</label>
      ${fieldHtml}
      <div class="save-row">
        <button class="btn-sm" data-save-content="${item.key}">Save</button>
        <span class="saved-msg" data-saved-for="${item.key}">Saved</span>
      </div>
    </div>
  `;
}

async function loadContent() {
  const list = document.getElementById('content-list');
  list.innerHTML = 'Loading…';
  try {
    const res = await fetch(`${API_BASE}/api/content`, { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) return showLogin();
    const items = await res.json();
    const byKey = {};
    items.forEach((item) => { byKey[item.key] = item; });
    const used = new Set();

    const sections = CONTENT_GROUPS.map((group) => {
      let body;
      if (group.pairs) {
        body = group.pairs
          .filter(([q, a]) => byKey[q] || byKey[a])
          .map(([q, a], i) => {
            [q, a].forEach((k) => used.add(k));
            return `
              <div class="faq-pair">
                <div class="faq-pair-num">FAQ ${i + 1}</div>
                ${byKey[q] ? renderContentField(byKey[q]) : ''}
                ${byKey[a] ? renderContentField(byKey[a]) : ''}
              </div>
            `;
          }).join('');
      } else {
        body = group.keys
          .filter((k) => byKey[k])
          .map((k) => { used.add(k); return renderContentField(byKey[k]); })
          .join('');
      }
      return body ? `<div class="content-section"><h3 class="content-section-title">${group.title}</h3>${body}</div>` : '';
    }).join('');

    const leftover = items.filter((item) => !used.has(item.key));
    const leftoverHtml = leftover.length
      ? `<div class="content-section"><h3 class="content-section-title">Other</h3>${leftover.map(renderContentField).join('')}</div>`
      : '';

    list.innerHTML = sections + leftoverHtml;

    list.querySelectorAll('[data-save-content]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.saveContent;
        const field = list.querySelector(`[data-key="${key}"]`);
        await fetch(`${API_BASE}/api/content/${key}`, {
          method: 'PUT',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: field.value }),
        });
        const msg = list.querySelector(`[data-saved-for="${key}"]`);
        msg.style.opacity = '1';
        setTimeout(() => { msg.style.opacity = '0'; }, 1800);
      });
    });
  } catch (err) {
    list.innerHTML = `<p style="color:var(--red-bright)">Could not reach the API at ${API_BASE}.</p>`;
  }
}

// ---------- Account (notification email + change password) ----------
async function loadAccount() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/account`, { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) return showLogin();
    const account = await res.json();
    document.getElementById('notify-email-input').value = account.notify_email || '';
  } catch (err) {
    /* Account tab just stays blank if the API isn't reachable */
  }
}

document.getElementById('save-email-btn').addEventListener('click', async () => {
  const email = document.getElementById('notify-email-input').value.trim();
  const msg = document.getElementById('email-msg');
  msg.className = 'account-msg';
  msg.textContent = '';
  try {
    const res = await fetch(`${API_BASE}/api/auth/account`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notify_email: email || null }),
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Could not save.');
    msg.classList.add('ok');
    msg.textContent = 'Saved.';
  } catch (err) {
    msg.classList.add('err');
    msg.textContent = err.message;
  }
});

document.getElementById('save-password-btn').addEventListener('click', async () => {
  const current = document.getElementById('current-password-input').value;
  const next = document.getElementById('new-password-input').value;
  const confirm = document.getElementById('confirm-password-input').value;
  const msg = document.getElementById('password-msg');
  msg.className = 'account-msg';
  msg.textContent = '';

  if (!current || !next) { msg.classList.add('err'); msg.textContent = 'Fill in both password fields.'; return; }
  if (next.length < 6) { msg.classList.add('err'); msg.textContent = 'New password must be at least 6 characters.'; return; }
  if (next !== confirm) { msg.classList.add('err'); msg.textContent = "New password and confirmation don't match."; return; }

  try {
    const res = await fetch(`${API_BASE}/api/auth/password`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: current, new_password: next }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Could not change password.');
    msg.classList.add('ok');
    msg.textContent = data.message;
    document.getElementById('current-password-input').value = '';
    document.getElementById('new-password-input').value = '';
    document.getElementById('confirm-password-input').value = '';
  } catch (err) {
    msg.classList.add('err');
    msg.textContent = err.message;
  }
});

// ---------- Boot ----------
if (!urlResetToken) {
  if (TOKEN) { showApp(); } else { showLogin(); }
}
