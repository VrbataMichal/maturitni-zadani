let notes = JSON.parse(localStorage.getItem('nots_notes') || '[]');
let currentId = null;
let saveTimer = null;

function save() {
  localStorage.setItem('nots_notes', JSON.stringify(notes));
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

function newNote() {
  const note = {
    id: Date.now().toString(),
    title: '',
    body: '',
    created: new Date().toISOString(),
    updated: new Date().toISOString()
  };
  notes.unshift(note);
  save();
  renderList();
  openNote(note.id);
}

function deleteNote(id, e) {
  if (e) e.stopPropagation();
  notes = notes.filter(n => n.id !== id);
  if (currentId === id) {
    currentId = null;
    renderEditor();
  }
  save();
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
        <div class="note-item-title">${note.title || '— bez názvu —'}</div>
        <div class="note-item-preview">${preview || '(prázdná)'}</div>
        <div class="note-item-date">${formatDate(note.updated)}</div>
      </div>`;
  });

  if (filtered.length === 0) {
    html += `<div class="empty-list">Žádné výsledky<br/>pro „${q}"</div>`;
  }

  el.innerHTML = html;
}

function renderEditor() {
  const area = document.getElementById('editorArea');

  if (!currentId) {
    area.innerHTML = `
      <div class="welcome" id="welcomeScreen">
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
        <span>Upraveno: ${formatDate(note.updated)}</span>
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

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function onTitleChange() {
  const note = notes.find(n => n.id === currentId);
  if (!note) return;
  note.title = document.getElementById('titleInput').value;
  note.updated = new Date().toISOString();
  scheduleSave();
  renderList();
}

function onBodyChange() {
  const note = notes.find(n => n.id === currentId);
  if (!note) return;
  note.body = document.getElementById('bodyInput').value;
  note.updated = new Date().toISOString();
  scheduleSave();
  const words = countWords(note.body);
  const chars = note.body.length;
  const stats = document.querySelector('.editor-stats');
  if (stats) {
    stats.innerHTML = `<span>${words} slov</span><span>${chars} znaků</span><span>Upraveno: ${formatDate(note.updated)}</span>`;
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    save();
    showToast('Uloženo ✓');
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

// Keyboard shortcut Ctrl+N
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    newNote();
  }
});

// Init
renderList();
renderEditor();
