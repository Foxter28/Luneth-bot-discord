/**
 * Simple JSON-file comment store.
 *
 * Comments are persisted in data/comments.json so they survive restarts.
 * Hard cap of 200 entries (oldest trimmed automatically).
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'comments.json');
const MAX = 200;

let comments = [];

// --- Load on startup ---
try {
  if (fs.existsSync(FILE)) {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (Array.isArray(raw)) comments = raw.slice(-MAX);
  }
} catch { /* start fresh */ }

function persist() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(comments, null, 2));
  } catch { /* non-fatal */ }
}

/**
 * Add a comment.
 * @param {{ name?: string, displayName: string, avatar?: string|null, message: string }} entry
 * @returns the saved comment object
 */
function addComment({ name, displayName, avatar, message }) {
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name || null,           // original Discord nick submitted by user
    displayName,                  // resolved display name (Anonymous Person if not in server)
    avatar: avatar || null,       // Discord avatar URL if member was online at submit time
    message,
    ts: Date.now(),
  };
  comments.push(entry);
  if (comments.length > MAX) comments = comments.slice(-MAX);
  persist();
  return entry;
}

function getAll() {
  return comments.slice().reverse(); // newest first
}

module.exports = { addComment, getAll };
