let memberCount = null;

function setMemberCount(n) { memberCount = typeof n === 'number' && n >= 0 ? n : null; }
function getMemberCount() { return memberCount; }

module.exports = { setMemberCount, getMemberCount };
