// ============================================================
// NoteVault — Folders + PDF + Public Read / Password Edit
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyAfXOIrKRC_8CtIyzR9YdjqzjmMammhmiQ",
  authDomain: "noty-7ab1b.firebaseapp.com",
  databaseURL: "https://noty-7ab1b-default-rtdb.firebaseio.com",
  projectId: "noty-7ab1b",
  storageBucket: "noty-7ab1b.firebasestorage.app",
  messagingSenderId: "41921107838",
  appId: "1:41921107838:web:be942916c8fb303732c52f",
  measurementId: "G-6HSRCDJ8N1"
};

const EDITOR_PASSWORD = "ilovetoplaywuwa123";

// ---------- State ----------
let db = null;
let storage = null;
let notes = [];
let folders = [];
let currentId = null;
let currentFolderId = "all";   // "all" | folderId | "none"
let currentFilter = "all";
let searchQuery = "";
let isPreview = false;
let isEditor = false;
let editingFolderId = null;    // for rename

// ---------- Helpers ----------
function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function simpleMarkdown(text) {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
  html = html.replace(/\n\n+/g, "</p><p>");
  html = `<p>${html}</p>`.replace(/<p><\/p>/g, "");
  html = html.replace(/<p>(<(h[1-3]|ul|pre|blockquote))/g, "$1");
  html = html.replace(/(<\/(h[1-3]|ul|pre|blockquote)>)<\/p>/g, "$1");
  return html;
}

// ---------- Firebase ----------
function initFirebase() {
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    storage = firebase.storage();
    return true;
  } catch (e) {
    console.error(e);
    document.getElementById("notesList").innerHTML =
      `<div class="loading-state" style="color:var(--danger)">Firebase init failed.</div>`;
    return false;
  }
}

function listenData() {
  if (!db) return;

  // Notes
  db.collection("notes")
    .orderBy("updatedAt", "desc")
    .onSnapshot(snapshot => {
      notes = [];
      snapshot.forEach(doc => notes.push({ id: doc.id, ...doc.data() }));
      renderNotesList();
      renderFolderSelect();
    }, err => {
      console.error(err);
      document.getElementById("notesList").innerHTML =
        `<div class="loading-state" style="color:var(--danger)">Failed to load notes.</div>`;
    });

  // Folders
  db.collection("folders")
    .orderBy("name")
    .onSnapshot(snapshot => {
      folders = [];
      snapshot.forEach(doc => folders.push({ id: doc.id, ...doc.data() }));
      renderFolders();
      renderFolderSelect();
    }, err => console.error("Folders error:", err));
}

// ---------- Folders UI ----------
function renderFolders() {
  const container = document.getElementById("foldersList");

  let html = `
    <div class="folder-item ${currentFolderId === "all" ? "active" : ""}" data-folder="all">
      <span class="folder-icon">📂</span>
      <span class="folder-name">All Notes</span>
    </div>
    <div class="folder-item ${currentFolderId === "none" ? "active" : ""}" data-folder="none">
      <span class="folder-icon">📄</span>
      <span class="folder-name">Uncategorized</span>
    </div>
  `;

  folders.forEach(f => {
    html += `
      <div class="folder-item ${currentFolderId === f.id ? "active" : ""}" data-folder="${f.id}">
        <span class="folder-icon">📁</span>
        <span class="folder-name">${escapeHtml(f.name)}</span>
        ${isEditor ? `
          <div class="folder-actions">
            <button class="folder-action-btn" data-action="rename" data-id="${f.id}" title="Rename">✏️</button>
            <button class="folder-action-btn" data-action="delete" data-id="${f.id}" title="Delete">🗑️</button>
          </div>
        ` : ""}
      </div>
    `;
  });

  container.innerHTML = html;

  // Click folder
  container.querySelectorAll(".folder-item").forEach(el => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".folder-action-btn")) return;
      currentFolderId = el.dataset.folder;
      renderFolders();
      renderNotesList();
    });
  });

  // Rename / Delete buttons
  container.querySelectorAll(".folder-action-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (btn.dataset.action === "rename") openRenameFolder(id);
      if (btn.dataset.action === "delete") deleteFolder(id);
    });
  });
}

function renderFolderSelect() {
  const select = document.getElementById("noteFolder");
  const currentVal = select.value;

  let html = `<option value="">No folder</option>`;
  folders.forEach(f => {
    html += `<option value="${f.id}">${escapeHtml(f.name)}</option>`;
  });
  select.innerHTML = html;

  // Restore selection if possible
  if (currentId) {
    const note = notes.find(n => n.id === currentId);
    if (note) select.value = note.folderId || "";
  } else if (currentVal) {
    select.value = currentVal;
  }
}

// ---------- Notes UI ----------
function getFilteredNotes() {
  let list = [...notes];

  // Folder filter
  if (currentFolderId === "none") {
    list = list.filter(n => !n.folderId);
  } else if (currentFolderId !== "all") {
    list = list.filter(n => n.folderId === currentFolderId);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(n =>
      (n.title || "").toLowerCase().includes(q) ||
      (n.content || "").toLowerCase().includes(q) ||
      (n.tags || []).some(t => t.toLowerCase().includes(q)) ||
      (n.pdfName || "").toLowerCase().includes(q)
    );
  }

  if (currentFilter === "pinned") {
    list = list.filter(n => n.pinned);
  } else if (currentFilter === "recent") {
    list = list.slice(0, 10);
  } else {
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      const ta = a.updatedAt?.toMillis?.() || a.updatedAt || 0;
      const tb = b.updatedAt?.toMillis?.() || b.updatedAt || 0;
      return tb - ta;
    });
  }
  return list;
}

function renderNotesList() {
  const list = getFilteredNotes();
  const container = document.getElementById("notesList");
  const countEl = document.getElementById("noteCount");

  countEl.textContent = `${notes.length} note${notes.length !== 1 ? "s" : ""}`;

  if (list.length === 0) {
    container.innerHTML = `<div class="loading-state">
      ${searchQuery ? "No matching notes" : "No notes in this folder"}
    </div>`;
    return;
  }

  container.innerHTML = list.map(n => {
    const preview = (n.content || "").replace(/\n/g, " ").slice(0, 50);
    const tags = (n.tags || []).slice(0, 2).map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("");
    const pdfBadge = n.pdfUrl ? '<span class="tag-chip" style="background:#fee2e2;color:#b91c1c">PDF</span>' : "";
    return `
      <div class="note-item ${n.id === currentId ? "active" : ""}" data-id="${n.id}">
        <div class="note-item-title">
          ${n.pinned ? '<span class="pin-badge">📌</span>' : ""}
          ${escapeHtml(n.title || "Untitled")}
        </div>
        <div class="note-item-preview">${escapeHtml(preview) || (n.pdfName ? n.pdfName : "Empty note")}</div>
        <div class="note-item-meta">
          <span>${formatDate(n.updatedAt)}</span>
          ${pdfBadge}
          ${tags}
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".note-item").forEach(el => {
    el.addEventListener("click", () => selectNote(el.dataset.id));
  });
}

function selectNote(id) {
  currentId = id;
  const note = notes.find(n => n.id === id);
  if (!note) return;

  document.getElementById("emptyState").classList.add("hidden");
  document.getElementById("editorView").classList.remove("hidden");

  document.getElementById("noteTitle").value = note.title || "";
  document.getElementById("noteContent").value = note.content || "";
  document.getElementById("noteTags").value = (note.tags || []).join(", ");
  document.getElementById("noteFolder").value = note.folderId || "";
  document.getElementById("updatedAt").textContent = `Updated ${formatDate(note.updatedAt)}`;

  updatePdfUI(note);
  applyEditMode();
  document.getElementById("pinBtn").style.color = note.pinned ? "var(--pinned)" : "";

  isPreview = false;
  document.getElementById("previewArea").classList.add("hidden");
  document.getElementById("noteContent").classList.remove("hidden");

  renderNotesList();
}

function updatePdfUI(note) {
  const display = document.getElementById("pdfDisplay");
  const uploadArea = document.getElementById("pdfUploadArea");
  const removeBtn = document.getElementById("pdfRemoveBtn");

  if (note.pdfUrl) {
    display.classList.remove("hidden");
    document.getElementById("pdfName").textContent = note.pdfName || "Document.pdf";
    document.getElementById("pdfViewBtn").href = note.pdfUrl;
    removeBtn.classList.toggle("hidden", !isEditor);
    uploadArea.classList.add("hidden");
  } else {
    display.classList.add("hidden");
    uploadArea.classList.toggle("hidden", !isEditor);
  }
}

function showEmpty() {
  currentId = null;
  document.getElementById("emptyState").classList.remove("hidden");
  document.getElementById("editorView").classList.add("hidden");
  renderNotesList();
}

function applyEditMode() {
  const canEdit = isEditor;
  document.getElementById("noteTitle").readOnly = !canEdit;
  document.getElementById("noteContent").readOnly = !canEdit;
  document.getElementById("noteTags").readOnly = !canEdit;
  document.getElementById("noteFolder").disabled = !canEdit;

  document.getElementById("newNoteBtn").classList.toggle("hidden", !canEdit);
  document.getElementById("newFolderBtn").classList.toggle("hidden", !canEdit);
  document.getElementById("pinBtn").classList.toggle("hidden", !canEdit);
  document.getElementById("deleteBtn").classList.toggle("hidden", !canEdit);

  document.getElementById("authBtn").textContent = canEdit ? "Logout" : "Login";
  document.getElementById("readOnlyHint").style.display = canEdit ? "none" : "block";

  renderFolders(); // refresh action buttons

  if (currentId) {
    const note = notes.find(n => n.id === currentId);
    if (note) updatePdfUI(note);
  }
}

// ---------- Note Actions ----------
async function createNote() {
  if (!isEditor || !db) return;

  const note = {
    title: "",
    content: "",
    tags: [],
    pinned: false,
    folderId: currentFolderId !== "all" && currentFolderId !== "none" ? currentFolderId : null,
    pdfUrl: null,
    pdfName: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    const ref = await db.collection("notes").add(note);
    setTimeout(() => selectNote(ref.id), 400);
  } catch (e) {
    alert("Failed to create note: " + e.message);
  }
}

async function updateCurrentNote() {
  if (!isEditor || !currentId || !db) return;

  const title = document.getElementById("noteTitle").value;
  const content = document.getElementById("noteContent").value;
  const tags = document.getElementById("noteTags").value
    .split(",").map(t => t.trim()).filter(Boolean);
  const folderId = document.getElementById("noteFolder").value || null;

  try {
    await db.collection("notes").doc(currentId).update({
      title,
      content,
      tags,
      folderId,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.error(e);
  }
}

let saveTimeout = null;
function scheduleSave() {
  if (!isEditor) return;
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(updateCurrentNote, 600);
}

async function togglePin() {
  if (!isEditor || !currentId || !db) return;
  const note = notes.find(n => n.id === currentId);
  if (!note) return;

  try {
    await db.collection("notes").doc(currentId).update({
      pinned: !note.pinned,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    alert("Failed to pin: " + e.message);
  }
}

async function deleteNote() {
  if (!isEditor || !currentId || !db) return;
  if (!confirm("Delete this note permanently?")) return;

  const note = notes.find(n => n.id === currentId);

  try {
    if (note && note.pdfUrl && storage) {
      try {
        await storage.refFromURL(note.pdfUrl).delete();
      } catch (e) { console.warn(e); }
    }
    await db.collection("notes").doc(currentId).delete();
    showEmpty();
  } catch (e) {
    alert("Failed to delete: " + e.message);
  }
}

function togglePreview() {
  isPreview = !isPreview;
  const content = document.getElementById("noteContent");
  const preview = document.getElementById("previewArea");

  if (isPreview) {
    preview.innerHTML = simpleMarkdown(content.value);
    content.classList.add("hidden");
    preview.classList.remove("hidden");
  } else {
    preview.classList.add("hidden");
    content.classList.remove("hidden");
  }
}

// ---------- PDF ----------
async function handlePdfUpload(file) {
  if (!isEditor || !currentId || !storage || !file) return;

  if (file.type !== "application/pdf") {
    alert("Please select a PDF file.");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    alert("PDF is too large. Maximum 10MB.");
    return;
  }

  const uploadingEl = document.getElementById("pdfUploading");
  uploadingEl.classList.remove("hidden");

  try {
    const path = `notes/${currentId}/${Date.now()}_${file.name}`;
    const ref = storage.ref(path);
    await ref.put(file);
    const url = await ref.getDownloadURL();

    await db.collection("notes").doc(currentId).update({
      pdfUrl: url,
      pdfName: file.name,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.error(e);
    alert("Upload failed: " + e.message);
  } finally {
    uploadingEl.classList.add("hidden");
    document.getElementById("pdfInput").value = "";
  }
}

async function removePdf() {
  if (!isEditor || !currentId || !db) return;
  if (!confirm("Remove the PDF from this note?")) return;

  const note = notes.find(n => n.id === currentId);
  if (!note || !note.pdfUrl) return;

  try {
    if (storage) {
      try { await storage.refFromURL(note.pdfUrl).delete(); } catch (e) { console.warn(e); }
    }
    await db.collection("notes").doc(currentId).update({
      pdfUrl: null,
      pdfName: null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    alert("Failed to remove PDF: " + e.message);
  }
}

// ---------- Folder Actions ----------
function openNewFolder() {
  editingFolderId = null;
  document.getElementById("folderModalTitle").textContent = "New Folder";
  document.getElementById("folderNameInput").value = "";
  document.getElementById("submitFolderBtn").textContent = "Create";
  document.getElementById("folderModal").classList.remove("hidden");
  document.getElementById("folderNameInput").focus();
}

function openRenameFolder(id) {
  const folder = folders.find(f => f.id === id);
  if (!folder) return;
  editingFolderId = id;
  document.getElementById("folderModalTitle").textContent = "Rename Folder";
  document.getElementById("folderNameInput").value = folder.name;
  document.getElementById("submitFolderBtn").textContent = "Save";
  document.getElementById("folderModal").classList.remove("hidden");
  document.getElementById("folderNameInput").focus();
}

function closeFolderModal() {
  document.getElementById("folderModal").classList.add("hidden");
  editingFolderId = null;
}

async function submitFolder() {
  const name = document.getElementById("folderNameInput").value.trim();
  if (!name) {
    alert("Please enter a folder name.");
    return;
  }

  try {
    if (editingFolderId) {
      await db.collection("folders").doc(editingFolderId).update({ name });
    } else {
      await db.collection("folders").add({
        name,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    closeFolderModal();
  } catch (e) {
    alert("Failed: " + e.message);
  }
}

async function deleteFolder(id) {
  if (!confirm("Delete this folder? Notes inside will become Uncategorized.")) return;

  try {
    // Move notes out of the folder
    const batch = db.batch();
    notes.filter(n => n.folderId === id).forEach(n => {
      batch.update(db.collection("notes").doc(n.id), { folderId: null });
    });
    batch.delete(db.collection("folders").doc(id));
    await batch.commit();

    if (currentFolderId === id) {
      currentFolderId = "all";
      renderFolders();
      renderNotesList();
    }
  } catch (e) {
    alert("Failed to delete folder: " + e.message);
  }
}

// ---------- Auth ----------
function openAuthModal() {
  document.getElementById("authModal").classList.remove("hidden");
  document.getElementById("passwordInput").value = "";
  document.getElementById("authError").classList.add("hidden");
  document.getElementById("passwordInput").focus();
}

function closeAuthModal() {
  document.getElementById("authModal").classList.add("hidden");
}

function tryUnlock() {
  const pw = document.getElementById("passwordInput").value;
  if (pw === EDITOR_PASSWORD) {
    isEditor = true;
    sessionStorage.setItem("notevault_editor", "1");
    closeAuthModal();
    applyEditMode();
  } else {
    document.getElementById("authError").classList.remove("hidden");
  }
}

function logout() {
  isEditor = false;
  sessionStorage.removeItem("notevault_editor");
  applyEditMode();
  if (currentId) selectNote(currentId);
}

// ---------- Theme ----------
function initTheme() {
  const saved = localStorage.getItem("notevault_theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("notevault_theme", next);
}

// ---------- Init ----------
function init() {
  initTheme();

  if (sessionStorage.getItem("notevault_editor") === "1") {
    isEditor = true;
  }

  if (initFirebase()) {
    listenData();
  }

  applyEditMode();

  // Notes
  document.getElementById("newNoteBtn").addEventListener("click", createNote);
  document.getElementById("pinBtn").addEventListener("click", togglePin);
  document.getElementById("deleteBtn").addEventListener("click", deleteNote);
  document.getElementById("previewBtn").addEventListener("click", togglePreview);
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);

  document.getElementById("noteTitle").addEventListener("input", scheduleSave);
  document.getElementById("noteContent").addEventListener("input", scheduleSave);
  document.getElementById("noteTags").addEventListener("input", scheduleSave);
  document.getElementById("noteFolder").addEventListener("change", scheduleSave);

  document.getElementById("searchInput").addEventListener("input", e => {
    searchQuery = e.target.value.trim();
    renderNotesList();
  });

  document.querySelectorAll(".filter-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentFilter = tab.dataset.filter;
      renderNotesList();
    });
  });

  // PDF
  document.getElementById("pdfInput").addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) handlePdfUpload(file);
  });
  document.getElementById("pdfRemoveBtn").addEventListener("click", removePdf);

  // Folders
  document.getElementById("newFolderBtn").addEventListener("click", openNewFolder);
  document.getElementById("submitFolderBtn").addEventListener("click", submitFolder);
  document.getElementById("cancelFolderBtn").addEventListener("click", closeFolderModal);
  document.getElementById("folderNameInput").addEventListener("keydown", e => {
    if (e.key === "Enter") submitFolder();
  });

  // Auth
  document.getElementById("authBtn").addEventListener("click", () => {
    if (isEditor) logout();
    else openAuthModal();
  });
  document.getElementById("submitAuthBtn").addEventListener("click", tryUnlock);
  document.getElementById("cancelAuthBtn").addEventListener("click", closeAuthModal);
  document.getElementById("passwordInput").addEventListener("keydown", e => {
    if (e.key === "Enter") tryUnlock();
  });

  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key === "n" && isEditor) {
      e.preventDefault();
      createNote();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "e" && currentId) {
      e.preventDefault();
      togglePreview();
    }
  });
}

init();
