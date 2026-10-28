'use strict';

// QuickBooks Desktop writes amounts using the Windows regional settings of the
// PC it runs on. A US install sends "12345.67"; a South African or European
// install can send "12 345,67" or "12.345,67". parseFloat("12 345,67") is 12,
// and parseFloat("12345,67") is 12345 - the cents disappear without an error.
//
// Rules, in order:
//   1. Drop spaces (incl. non-breaking/narrow spaces) and apostrophes - they are
//      only ever thousands separators.
//   2. If both "," and "." appear, whichever comes LAST is the decimal mark.
//   3. A single "," with no "." is a decimal comma ("1,5" = 1.5).
//   4. Several "," with no "." are thousands separators ("1,234,567").
// Anything that still isn't a plain number returns 0 (amount fields are never
// optional in QuickBooks, so 0 is the safe default for an empty element).
function parseQbDecimal(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  let s = String(value).replace(/[\s\u00a0\u202f']/g, '');
  if (s === '') return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    s = lastComma > lastDot
      ? s.replace(/\./g, '').replace(',', '.')   // 12.345,67
      : s.replace(/,/g, '');                      // 12,345.67
  } else if (lastComma !== -1) {
    const commas = s.split(',').length - 1;
    s = commas === 1 ? s.replace(',', '.') : s.replace(/,/g, '');
  }

  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return 0;
  return Number(s);
}

module.exports = { parseQbDecimal };
