import { describe, expect, it } from 'vitest';
import { actionLabel, actorLabel } from './team-helpers';

describe('actionLabel', () => {
  it('maps known codes to plain labels', () => {
    expect(actionLabel('investigation.open')).toBe('Opened an investigation');
    expect(actionLabel('workspace.export')).toBe('Exported the workspace');
  });
  it('adds the role for member add/invite, not for remove', () => {
    expect(actionLabel('member.invite', { role: 'editor' })).toBe('Invited a new member by email (editor)');
    expect(actionLabel('member.remove', { role: 'editor', self: true })).toBe('Removed a member');
  });
  it('falls back to the raw code', () => {
    expect(actionLabel('something.new')).toBe('something.new');
  });
});

describe('actorLabel', () => {
  const me = '11111111-2222-3333-4444-555555555555';
  it('shows you / short id / deleted account', () => {
    expect(actorLabel(me, me)).toBe('you');
    expect(actorLabel('abcdef01-0000-0000-0000-000000000000', me)).toBe('abcdef01');
    expect(actorLabel(null, me)).toBe('deleted account');
    expect(actorLabel(me, null)).toBe('11111111');
  });
});
