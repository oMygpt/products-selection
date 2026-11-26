import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, sanitizeHtml, isSafeUrl } from '../public/markdown.js';

test('blocks javascript:, vbscript:, and data: URLs', () => {
  assert.equal(isSafeUrl('https://github.com/org/repo'), true);
  assert.equal(isSafeUrl('mailto:hi@example.com'), true);
  assert.equal(isSafeUrl('#section'), true);
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeUrl('  java\nscript:alert(1)'), false);
  assert.equal(isSafeUrl('data:text/html,<script>alert(1)</script>'), false);
});

test('strips XSS vectors from untrusted README HTML', () => {
  const malicious = [
    '# Title',
    '<script>alert(document.cookie)</script>',
    '<img src="x" onerror="alert(1)" />',
    '<svg onload="alert(1)"></svg>',
    '<a href="javascript:alert(1)">click</a>',
    '[bad](javascript:alert(1))'
  ].join('\n\n');

  const html = renderMarkdown(malicious, 'https://raw.githubusercontent.com/o/r/main/', 'o/r', 'main');
  assert.ok(!/<script/i.test(html));
  assert.ok(!/onerror\s*=/i.test(html));
  assert.ok(!/onload\s*=/i.test(html));
  assert.ok(!/<svg/i.test(html));
  assert.ok(!/javascript:/i.test(html));
  assert.ok(html.includes('<h1>Title</h1>'));
});

test('sanitizeHtml removes inline event handlers and style attributes', () => {
  const dirty = '<div onclick="evil()" style="background:url(javascript:alert(1))"><p>Safe text</p></div>';
  const clean = sanitizeHtml(dirty);
  assert.ok(!/onclick/i.test(clean));
  assert.ok(!/style=/i.test(clean));
  assert.ok(clean.includes('Safe text'));
});
