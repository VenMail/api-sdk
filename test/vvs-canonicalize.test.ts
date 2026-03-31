import { canonicalizeBody, canonicalizeHeaders, buildCanonicalPayload } from '../src/vvs/canonicalize';

describe('VVS Canonicalization', () => {
  describe('canonicalizeBody', () => {
    it('normalizes CRLF to LF', () => {
      expect(canonicalizeBody('hello\r\nworld')).toBe('hello\nworld');
    });

    it('normalizes bare CR to LF', () => {
      expect(canonicalizeBody('hello\rworld')).toBe('hello\nworld');
    });

    it('strips trailing whitespace from lines', () => {
      expect(canonicalizeBody('hello   \nworld\t')).toBe('hello\nworld');
    });

    it('preserves leading whitespace', () => {
      expect(canonicalizeBody('  hello\n  world')).toBe('  hello\n  world');
    });

    it('handles empty body', () => {
      expect(canonicalizeBody('')).toBe('');
    });

    it('handles mixed line endings', () => {
      expect(canonicalizeBody('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
    });
  });

  describe('canonicalizeHeaders', () => {
    it('sorts headers alphabetically', () => {
      const result = canonicalizeHeaders({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        date: 'Mon, 30 Mar 2026 12:00:00 +0000',
      });
      expect(result).toBe(
        'date:Mon, 30 Mar 2026 12:00:00 +0000\n' +
        'from:sender@example.com\n' +
        'subject:Test\n' +
        'to:recipient@example.com'
      );
    });

    it('trims whitespace from values', () => {
      const result = canonicalizeHeaders({
        from: '  sender@example.com  ',
        to: 'recipient@example.com',
        subject: 'Test',
        date: 'Mon, 30 Mar 2026 12:00:00 +0000',
      });
      expect(result).toContain('from:sender@example.com');
    });

    it('folds multi-line values', () => {
      const result = canonicalizeHeaders({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Long\n subject line',
        date: 'Mon, 30 Mar 2026 12:00:00 +0000',
      });
      expect(result).toContain('subject:Long subject line');
    });
  });

  describe('buildCanonicalPayload', () => {
    it('concatenates with newlines and trailing newline', () => {
      const result = buildCanonicalPayload(
        'agent@example.com',
        '1234567890',
        'abc123',
        'sha256=hash',
        'date:...\nfrom:...'
      );
      expect(result).toBe('agent@example.com\n1234567890\nabc123\nsha256=hash\ndate:...\nfrom:...\n');
    });
  });
});
