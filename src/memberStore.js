/**
 * Shared in-memory store of server member usernames.
 * Written by index.js (bot) — read by httpServer.js (website) to verify
 * whether a guestbook name belongs to a real server member.
 */
let members = new Set();

/** @param {Array<{id:string, username:string, displayName?:string}>} list */
function setMembers(list) {
  const out = new Set();
  (Array.isArray(list) ? list : []).forEach(m => {
    [m.username, m.displayName, m.tag].forEach(n => {
      if (n) out.add(String(n).toLowerCase().trim());
    });
  });
  members = out;
}

function hasMember(name) {
  const n = String(name || '').toLowerCase().trim();
  if (!n) return false;
  if (members.has(n)) return true;
  // widget/display names often carry prefixes like '! ' — match them too
  return Array.from(members).some(m => m.includes(n) || n.includes(m));
}

module.exports = { setMembers, hasMember };
