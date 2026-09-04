const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

// 1:1 with a Bill. encrypted_data is one AES-256-GCM blob (see utils/crypto.js)
// — never plaintext. given_date is the only plain field.
const billCredentialSchema = new mongoose.Schema({
  bill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', required: true, unique: true },
  given_date: { type: Date, default: null },
  encrypted_data: { type: String, default: null },
  updated_at: { type: Date, default: Date.now },
});

applyIdTransform(billCredentialSchema);

module.exports = mongoose.model('BillCredential', billCredentialSchema);
