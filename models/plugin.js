// models/plugin.js
// Shared across every schema: replaces Mongo's _id/__v with a plain `id`
// string so every API response keeps the exact same shape the frontend
// already expects from the old SQL rows (id, not _id).
function applyIdTransform(schema) {
  const transform = (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  };
  schema.set('toJSON', { virtuals: true, transform });
  schema.set('toObject', { virtuals: true, transform });
}

module.exports = { applyIdTransform };
