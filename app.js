// ============================================================
// NoteVault — Public Read / Password Edit (Firebase version)
// ============================================================

// ---------- Firebase Config ----------
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
// -------------------------------------

// Editor password
const EDITOR_PASSWORD = "ilovetoplaywuwa123";

// ---------- State ----------
let db = null;
let notes = [];
let currentId = null;
let currentFilter = "all";
let searchQuery = "";
let isPreview = false;
let isEditor = false;
let unsubscribe = null;

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
    return true;
  } catch (e) {
    console.error(e);
    document.getElementById("notesList").innerHTML =
      `<div class="loading-state" style="color:var(--danger)">Firebase init failed. Check console.</div>`;
    return false;
  }
}

function listenNotes() {
  if (!db) return;

  unsubscribe = db.collection("notes")
    .orderBy("updatedAt", "desc")
    .onSnapshot(snapshot => {
      notes = [];
      snapshot.forEach(doc => {
        notes.push({ id: doc.id, ...doc.data() });
      });
      renderNotesList();
    }, err => {
      console.error("Listen error:", err);
      document.getElementById("notesList").innerHTML =
        `<div class="loading-state" style="color:var(--danger)">
          Failed to load notes.<br>
          Make sure you created <strong>Firestore</strong> and set the rules.
        </div>`;
    });
}

// ---------- Render ----------
function getFilteredNotes() {
  let list = [...notes];

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(n =>
      (n.title || "").toLowerCase().includes(q) ||
      (n.content || "").toLowerCase().includes(q) ||
      (n.tags || []).some(t => t.toLowerCase().includes(q))
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
      ${searchQuery ? "No matching notes" : "No notes yet"}
    </div>`;
    return;
  }

  container.innerHTML = list.map(n => {
    const preview = (n.content || "").replace(/\n/g, " ").slice(0, 60);
    const tags = (n.tags || []).slice(0, 2).map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("");
    return `
      <div class="note-item ${n.id === currentId ? "active" : ""}" data-id="${n.id}">
        <div class="note-item-title">
          ${n.pinned ? '<span class="pin-badge">📌</span>' : ""}
          ${escapeHtml(n.title || "Untitled")}
        </div>
        <div class="note-item-preview">${escapeHtml(preview) || "Empty note"}</div>
        <div class="note-item-meta">
          <span>${formatDate(n.updatedAt)}</span>
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
  document.getElementById("updatedAt").textContent = `Updated ${formatDate(note.updatedAt)}`;

  applyEditMode();
  document.getElementById("pinBtn").style.color = note.pinned ? "var(--pinned)" : "";

  isPreview = false;
  document.getElementById("previewArea").classList.add("hidden");
  document.getElementById("noteContent").classList.remove("hidden");

  renderNotesList();
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

  document.getElementById("newNoteBtn").classList.toggle("hidden", !canEdit);
  document.getElementById("pinBtn").classList.toggle("hidden", !canEdit);
  document.getElementById("deleteBtn").classList.toggle("hidden", !canEdit);

  document.getElementById("authBtn").textContent = canEdit ? "Logout" : "Login";
  document.getElementById("readOnlyHint").style.display = canEdit ? "none" : "block";
}

// ---------- Actions ----------
async function createNote() {
  if (!isEditor || !db) return;

  const note = {
    title: "",
    content: "",
    tags: [],
    pinned: false,
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

  try {
    await db.collection("notes").doc(currentId).update({
      title,
      content,
      tags,
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

  try {
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
    listenNotes();
  }

  applyEditMode();

  document.getElementById("newNoteBtn").addEventListener("click", createNote);
  document.getElementById("pinBtn").addEventListener("click", togglePin);
  document.getElementById("deleteBtn").addEventListener("click", deleteNote);
  document.getElementById("previewBtn").addEventListener("click", togglePreview);
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);

  document.getElementById("noteTitle").addEventListener("input", scheduleSave);
  document.getElementById("noteContent").addEventListener("input", scheduleSave);
  document.getElementById("noteTags").addEventListener("input", scheduleSave);

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
