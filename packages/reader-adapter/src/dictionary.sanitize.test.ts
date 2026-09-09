// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanitizeDefinitionHtml } from './dictionary/stardict'

describe('sanitizeDefinitionHtml', () => {
  it('strips active content (untrusted input, spec §117)', () => {
    const dirty =
      '<b>ok</b><script>alert(1)</script><img src=x onerror="alert(1)"><style>x{}</style>'
    const clean = sanitizeDefinitionHtml(dirty, new DOMParser())
    expect(clean).toContain('<b>ok</b>')
    expect(clean).not.toContain('script')
    expect(clean).not.toContain('onerror')
    expect(clean).not.toContain('<style')
  })
})
