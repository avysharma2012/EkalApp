// A short, common list — not exhaustive, just enough to catch the obvious cases (SEC-02).
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'letmein', 'welcome123', 'admin123', 'iloveyou', 'monkey123',
  'football', 'abc123456', 'trustno1', 'dragon123', 'baseball1', 'sunshine1',
]);

function hasSequential(pw) {
  const lower = pw.toLowerCase();
  const sequences = ['abcdefghijklmnopqrstuvwxyz', '01234567890'];
  return sequences.some((seq) => {
    for (let i = 0; i <= seq.length - 3; i++) {
      if (lower.includes(seq.slice(i, i + 3))) return true;
    }
    return false;
  });
}

function hasRepeatedChar(pw) {
  return /(.)\1{2,}/.test(pw);
}

// Returns { valid, score (0-4), label, feedback[] }. `valid` gates form submission;
// everything else is advisory strength feedback shown to the user.
export function checkPasswordPolicy(pw) {
  const feedback = [];
  let score = 0;

  const longEnough = pw.length >= 8;
  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  const isCommon = COMMON_PASSWORDS.has(pw.toLowerCase());

  if (!longEnough) feedback.push('At least 8 characters');
  if (!hasUpper) feedback.push('At least one uppercase letter');
  if (!hasLower) feedback.push('At least one lowercase letter');
  if (!hasDigit) feedback.push('At least one number');
  if (!hasSpecial) feedback.push('At least one special character');
  if (isCommon) feedback.push('This is a commonly used password — pick something less guessable');

  const valid = longEnough && hasUpper && hasLower && hasDigit && hasSpecial && !isCommon;

  score = [longEnough, hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length - (isCommon ? 3 : 0);
  score = Math.max(0, Math.min(4, score));

  if (hasSequential(pw)) {
    feedback.push('Avoid simple sequences like "abc" or "123"');
    score = Math.max(0, score - 1);
  }
  if (hasRepeatedChar(pw)) {
    feedback.push('Avoid repeated characters like "aaa"');
    score = Math.max(0, score - 1);
  }

  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
  return { valid, score, label: labels[score], feedback };
}
