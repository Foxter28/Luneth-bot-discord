/** shared in-memory store for booster data — written by index.js, read by httpServer.js */
let boosters = [];
let updatedAt = 0;

function setBoosters(list) {
  boosters = Array.isArray(list) ? list : [];
  updatedAt = Date.now();
}

function getBoosters() {
  return { boosters, updatedAt, count: boosters.length };
}

module.exports = { setBoosters, getBoosters };
