// middleware/activityLogger.js
// Mounted once, right after requireAuth + checkUserStatus, on every
// /api/* request. Writes one ActivityLog row for every successful
// create/update/delete — this is what lets the admin panel show who's
// actually adding entries and when, without every route file (loans.js,
// rent.js, admin.js, ...) having to remember to log itself.
//
// GET requests are never logged (nothing changed). Failed requests
// (4xx/5xx) are never logged (nothing actually changed). No request body
// is ever stored verbatim — summary() only pulls a small, fixed allowlist
// of harmless display fields, so things like passwords never end up here.
const { ActivityLog } = require('../models');

const ACTION_BY_METHOD = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };

// Deliberately an allowlist, not a blocklist — new fields added to any
// route in the future (passwords, tokens, encrypted credentials, etc.)
// are safe by default instead of accidentally getting logged.
const SUMMARY_FIELDS = [
  'person_name', 'full_name', 'description', 'category', 'label', 'name',
  'title', 'direction', 'amount', 'status', 'month', 'month_year', 'type',
  'key', 'role', 'plan', 'is_active', 'disabled_features',
];

function summarize(body) {
  if (!body || typeof body !== 'object') return '';
  const parts = [];
  for (const key of SUMMARY_FIELDS) {
    const val = body[key];
    if (val === undefined || val === null || val === '') continue;
    const text = Array.isArray(val) ? val.join('/') : String(val);
    parts.push(`${key}: ${text.slice(0, 60)}`);
    if (parts.length >= 4) break;
  }
  return parts.join(', ');
}

// Resource name comes from the URL itself (e.g. /api/loans/123 -> 'loans',
// /api/admin/users/123 -> 'admin-users') rather than from req.baseUrl,
// since this middleware runs before the request reaches whichever
// sub-router will actually handle it.
function resourceFromUrl(originalUrl) {
  const parts = originalUrl.split('?')[0].split('/').filter(Boolean); // ['api','loans','123']
  if (parts[1] === 'admin' && parts[2]) return `admin-${parts[2]}`; // admin-users
  return parts[1] || 'unknown';
}

function resourceIdFromUrl(originalUrl, params) {
  if (params && params.id) return String(params.id);
  const parts = originalUrl.split('?')[0].split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  return /^[0-9a-fA-F]{24}$/.test(last) ? last : null;
}

function activityLogger(req, res, next) {
  const method = req.method.toUpperCase();
  const action = ACTION_BY_METHOD[method];
  if (!action) return next(); // only log mutating requests

  const originalUrl = req.originalUrl;
  const capturedUser = req.user; // same reference will still be populated by the time 'finish' fires

  res.on('finish', () => {
    if (res.statusCode >= 400) return; // request failed — nothing actually changed
    if (!capturedUser) return;

    ActivityLog.create({
      user: capturedUser.id,
      full_name: capturedUser.full_name || '',
      username: capturedUser.username || '',
      email: capturedUser.email || '',
      action,
      resource: resourceFromUrl(originalUrl),
      resource_id: resourceIdFromUrl(originalUrl, req.params),
      method,
      path: originalUrl,
      summary: summarize(req.body),
      status_code: res.statusCode,
    }).catch(err => console.error('Activity log write failed:', err.message));
  });

  next();
}

module.exports = { activityLogger };
