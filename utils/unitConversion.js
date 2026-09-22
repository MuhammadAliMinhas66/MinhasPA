// utils/unitConversion.js
// Single source of truth for converting between weight units used for gold
// (and reusable for any other weighed asset later). Base unit = troy ounce,
// since that's what goldapi.io quotes.

const GRAMS_PER = {
  gram: 1,
  tola: 11.6638038,     // 1 tola = 11.6638038 grams (South Asian standard)
  ounce: 31.1034768,    // troy ounce
  kilogram: 1000,
};

function toGrams(quantity, unit) {
  const factor = GRAMS_PER[unit];
  if (!factor) throw new Error(`Unknown gold unit: ${unit}`);
  return quantity * factor;
}

// Convert a quantity in `unit` to troy ounces (the unit goldapi.io prices in).
function toTroyOunces(quantity, unit) {
  return toGrams(quantity, unit) / GRAMS_PER.ounce;
}

module.exports = { toGrams, toTroyOunces, GRAMS_PER };
