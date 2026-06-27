// @ts-nocheck
/* utils.js — Funções utilitárias compartilhadas entre os módulos */

/**
 * Formata um valor numérico como preço em dólar.
 * A precisão decimal aumenta conforme o valor diminui.
 *
 * @param {number} v - Valor a formatar
 * @returns {string} Ex: "$64,179.30", "$0.000015"
 */
function fmtPrice(v) {
  if (v == null || isNaN(v)) return '—';
  if (v >= 10000) return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1000)  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 100)   return '$' + v.toFixed(2);
  if (v >= 1)     return '$' + v.toFixed(4);
  if (v >= 0.01)  return '$' + v.toFixed(5);
  return '$' + v.toFixed(6);
}

/**
 * Formata um valor grande em notação abreviada (T, B, M).
 *
 * @param {number} v - Valor a formatar
 * @returns {string} Ex: "$1.29T", "$46.35B", "$208.43M"
 */
function fmtLarge(v) {
  if (!v) return '—';
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9)  return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6)  return '$' + (v / 1e6).toFixed(2) + 'M';
  return '$' + v.toLocaleString('en-US');
}

/**
 * Formata uma variação percentual com sinal + ou -.
 *
 * @param {number} v - Valor percentual
 * @returns {string} Ex: "+2.35%", "-0.54%"
 */
function fmtPct(v) {
  if (v == null || isNaN(v)) return '—';
  const sign = v >= 0 ? '+' : '';
  return sign + v.toFixed(2) + '%';
}

/**
 * Formata volume em notação abreviada com símbolo $.
 *
 * @param {number} v - Valor do volume
 * @returns {string} Ex: "$400.00K", "$15.60B"
 */
function fmtVolume(v) {
  if (!v) return '—';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(2) + 'K';
  return '$' + v.toFixed(2);
}