// Shared formatting helpers.

// Format a number with thousands separators using Indonesian locale (dot every 3 digits).
// Examples: 150000 -> "150.000", 12500 -> "12.500", 1000 -> "1.000"
function formatNumber(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

module.exports = { formatNumber };
