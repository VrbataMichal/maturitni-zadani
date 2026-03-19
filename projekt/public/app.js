let notes = [];
let currentId = null;
let saveTimer = null;


let cryptoKey = null;

async function deriveKey(password, username) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password),
    { name:'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(username), iterations: 200000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  );
}

async function encrypt(text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, cryptoKey, enc.encode(text)
  );
  // spojíme iv + zašifrovaná data do base64
  const buf = new Uint8Array(iv.byteLength + cipher.byteLength);
  buf.set(iv, 0);
  buf.set(new Uint8Array(cipher), iv.byteLength);
  return btoa(String.fromCharCode(...buf));
}

async function decrypt(base64) {
  try {
    const buf = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const iv = buf.slice(0, 12);
    const cipher = buf.slice(12);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, cryptoKey, cipher
    );
    return new TextDecoder().decode(plain);
  } catch {
    return ''; // dešifrování selhalo
  }
}


async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (res.status === 401) { window.location.href = '/login'; return null; }
  return res.json();
}

async function saveNoteToServer(note) {
  const encTitle = await encrypt(note.title);
  const encBody = await encrypt(note.body);
  await apiFetch('/api/notes', {
    method: 'POST',
    body: JSON.stringify({
      id: note.id,
      title: encTitle,
      body: encBody,
      created_at: note.created_at,
      updated_at: note.updated_at
    })
  });
}

async function deleteNoteFromServer(id) {
  await apiFetch(`/api/notes/${id}`, { method: 'DELETE' });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

function countWords(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

async function newNote() {
  const note = {
    id: Date.now().toString(),
    title: '',
    body: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  notes.unshift(note);
  await saveNoteToServer(note);
  renderList();
  openNote(note.id);
}

async function deleteNote(id, e) {
  if (e) e.stopPropagation();
  notes = notes.filter(n => n.id !== id);
  if (currentId === id) {
    currentId = null;
    renderEditor();
  }
  await deleteNoteFromServer(id);
  renderList();
  showToast('Poznámka smazána');
}

function openNote(id) {
  currentId = id;
  renderList();
  renderEditor();
}

function renderList() {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const filtered = notes.filter(n =>
    n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
  );

  const el = document.getElementById('notesList');
  if (notes.length === 0) {
    el.innerHTML = `<div class="empty-list">Žádné poznámky.<br/>Klikni na "Nová poznámka".</div>`;
    return;
  }

  let html = `<div class="filter-header"><span>POZNÁMKY <span class="count-badge">${filtered.length}</span></span></div>`;

  filtered.forEach((note, i) => {
    const preview = note.body.replace(/\n/g, ' ').slice(0, 60);
    html += `
      <div class="note-item ${note.id === currentId ? 'active' : ''}" onclick="openNote('${note.id}')" style="animation-delay:${i*0.03}s">
        <button class="note-item-delete" onclick="deleteNote('${note.id}', event)" title="Smazat">✕</button>
        <div class="note-item-title">${escHtml(note.title) || '— bez názvu —'}</div>
        <div class="note-item-preview">${escHtml(preview) || '(prázdná)'}</div>
        <div class="note-item-date">${formatDate(note.updated_at)}</div>
      </div>`;
  });

  if (filtered.length === 0) {
    html += `<div class="empty-list">Žádné výsledky<br/>pro „${escHtml(q)}"</div>`;
  }

  el.innerHTML = html;
}

function renderEditor() {
  const area = document.getElementById('editorArea');

  if (!currentId) {
    area.innerHTML = `
      <div class="welcome">
        <div class="welcome-icon">✦</div>
        <h2>Začni psát</h2>
        <p>Vyber poznámku nebo vytvoř novou</p>
      </div>`;
    return;
  }

  const note = notes.find(n => n.id === currentId);
  if (!note) return;

  const words = countWords(note.body);
  const chars = note.body.length;

  area.innerHTML = `
    <div class="editor-toolbar">
      <div class="editor-stats">
        <span>${words} slov</span>
        <span>${chars} znaků</span>
        <span>Upraveno: ${formatDate(note.updated_at)}</span>
      </div>
      <div class="editor-actions">
        <button class="btn-icon" onclick="exportNote()">↓ Export</button>
        <button class="btn-icon danger" onclick="deleteNote('${note.id}')">✕ Smazat</button>
      </div>
    </div>
    <div class="editor-content">
      <textarea class="title-input" id="titleInput" placeholder="Název poznámky…" rows="1" oninput="autoResize(this); onTitleChange()">${escHtml(note.title)}</textarea>
      <div class="title-separator"></div>
      <textarea class="body-input" id="bodyInput" placeholder="Začni psát…" oninput="onBodyChange()">${escHtml(note.body)}</textarea>
    </div>`;

  autoResize(document.getElementById('titleInput'));
}

function onTitleChange() {
  const note = notes.find(n => n.id === currentId);
  if (!note) return;
  note.title = document.getElementById('titleInput').value;
  note.updated_at = new Date().toISOString();
  scheduleSave();
  renderList();
}

function onBodyChange() {
  const note = notes.find(n => n.id === currentId);
  if (!note) return;
  note.body = document.getElementById('bodyInput').value;
  note.updated_at = new Date().toISOString();
  scheduleSave();
  const words = countWords(note.body);
  const chars = note.body.length;
  const stats = document.querySelector('.editor-stats');
  if (stats) {
    stats.innerHTML = `<span>${words} slov</span><span>${chars} znaků</span><span>Upraveno: ${formatDate(note.updated_at)}</span>`;
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const note = notes.find(n => n.id === currentId);
    if (note) {
      await saveNoteToServer(note);
      showToast('Uloženo ✓');
    }
  }, 800);
}

function exportNote() {
  const note = notes.find(n => n.id === currentId);
  if (!note) return;
  const content = `# ${note.title}\n\n${note.body}`;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (note.title || 'poznamka') + '.txt';
  a.click();
  showToast('Exportováno');
}

async function logout() {
  sessionStorage.removeItem('pw');
  await apiFetch('/api/logout', { method: 'POST' });
  window.location.href = '/login';
}

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    newNote();
  }
});

async function init() {
  const me = await apiFetch('/api/me');
  
if (!me) return;

   const pw = sessionStorage.getItem('pw');
   if (!pw) { window.location.href = '/login'; return; }
   cryptoKey = await deriveKey(pw, me.username);

   const meta = document.getElementById('headerMeta');
   if (meta) meta.innerHTML = `${escHtml(me.username)} · <a href="#" onclick="logout()" style="color:var(--muted);text-decoration:none;">odhlásit</a>`;


  const data = await apiFetch('/api/notes');
  if (data) {

    for (const note of data) {
      note.title = await decrypt(note.title);
       note.body = await decrypt(note.body);
           }

    notes = data;
    renderList();
    renderEditor();
  }
}

init();