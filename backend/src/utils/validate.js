// Small declarative input validator used by every write endpoint.
//
//   const data = validate(req.body, {
//     email: { type: 'email', required: true },
//     weekly_budget_limit: { type: 'number', min: 0, required: true },
//   });
//
// Returns a cleaned object containing only the declared fields (converted to
// the right JS types) or throws a 400 ApiError listing every problem found.
const { ApiError } = require('./errors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function checkField(name, raw, rule) {
  const label = rule.label || name;
  switch (rule.type) {
    case 'string':
    case 'email': {
      if (typeof raw !== 'string' && typeof raw !== 'number') return { error: `${label} must be text` };
      const value = String(raw).trim();
      if (rule.minLength && value.length < rule.minLength) return { error: `${label} must be at least ${rule.minLength} characters` };
      if (rule.maxLength && value.length > rule.maxLength) return { error: `${label} must be at most ${rule.maxLength} characters` };
      if (rule.type === 'email' && !EMAIL_RE.test(value)) return { error: `${label} must be a valid email address` };
      if (rule.pattern && !rule.pattern.test(value)) return { error: rule.patternMessage || `${label} has an invalid format` };
      return { value: rule.type === 'email' ? value.toLowerCase() : value };
    }
    case 'int':
    case 'number': {
      const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (!Number.isFinite(value)) return { error: `${label} must be a number` };
      if (rule.type === 'int' && !Number.isInteger(value)) return { error: `${label} must be a whole number` };
      if (rule.min !== undefined && value < rule.min) return { error: `${label} must be at least ${rule.min}` };
      if (rule.max !== undefined && value > rule.max) return { error: `${label} must be at most ${rule.max}` };
      if (rule.gt !== undefined && !(value > rule.gt)) return { error: `${label} must be greater than ${rule.gt}` };
      return { value };
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return { value: raw };
      if (['true', '1', 'on'].includes(String(raw).toLowerCase())) return { value: true };
      if (['false', '0', 'off'].includes(String(raw).toLowerCase())) return { value: false };
      return { error: `${label} must be true or false` };
    }
    case 'date': {
      const value = String(raw).trim();
      const d = new Date(`${value}T00:00:00Z`);
      if (!DATE_RE.test(value) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
        return { error: `${label} must be a valid date (YYYY-MM-DD)` };
      }
      return { value };
    }
    case 'enum': {
      const value = String(raw).trim();
      const match = rule.values.find((v) => v.toLowerCase() === value.toLowerCase());
      if (!match) return { error: `${label} must be one of: ${rule.values.join(', ')}` };
      return { value: match };
    }
    case 'array': {
      if (!Array.isArray(raw)) return { error: `${label} must be a list` };
      if (rule.minItems && raw.length < rule.minItems) return { error: `${label} needs at least ${rule.minItems} item(s)` };
      if (!rule.items) return { value: raw };
      const value = [];
      for (let i = 0; i < raw.length; i += 1) {
        try {
          value.push(validate(raw[i], rule.items));
        } catch (err) {
          return { error: `${label} #${i + 1}: ${(err.details || []).map((d) => d.message).join('; ')}` };
        }
      }
      return { value };
    }
    default:
      throw new Error(`Unknown validation type ${rule.type}`);
  }
}

function validate(input, schema, { partial = false } = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const out = {};
  const errors = [];
  for (const [name, rule] of Object.entries(schema)) {
    const raw = source[name];
    if (isBlank(raw)) {
      if (rule.required && !partial) errors.push({ field: name, message: `${rule.label || name} is required` });
      else if (rule.nullable && raw !== undefined) out[name] = null;
      else if (rule.default !== undefined && !partial) out[name] = rule.default;
      continue;
    }
    const { value, error } = checkField(name, raw, rule);
    if (error) errors.push({ field: name, message: error });
    else out[name] = value;
  }
  if (errors.length) throw ApiError.badRequest('Validation failed', errors);
  if (partial && Object.keys(out).length === 0) throw ApiError.badRequest('No valid fields to update');
  return out;
}

// Parses an integer path/query parameter such as :id.
function intParam(value, name = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw ApiError.badRequest(`${name} must be a positive integer`);
  return n;
}

module.exports = { validate, intParam };
