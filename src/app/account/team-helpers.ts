// Pure display helpers for the account team/activity panels.

const LABELS: Record<string, string> = {
  'workspace.create': 'Created the workspace',
  'workspace.export': 'Exported the workspace',
  'workspace.delete': 'Deleted the workspace',
  'member.upsert': 'Added a member or changed a role',
  'member.invite': 'Invited a new member by email',
  'member.remove': 'Removed a member',
  'project.create': 'Created a project',
  'revision.confirm': 'Confirmed a circuit revision',
  'investigation.open': 'Opened an investigation',
  'investigation.close': 'Closed an investigation',
  'artifact.upload': 'Uploaded a schematic image',
  'account.delete': 'Deleted their account',
};

/** Plain label for an audit action code; unknown codes are shown as-is. */
export function actionLabel(action: string, metadata?: Record<string, unknown> | null): string {
  const base = LABELS[action] ?? action;
  const role = metadata?.role;
  return typeof role === 'string' && action.startsWith('member.') && action !== 'member.remove' ? `${base} (${role})` : base;
}

/** "you" for the signed-in user, "deleted account" when the actor is gone (null), else a short id. */
export function actorLabel(actorId: string | null | undefined, meId: string | null | undefined): string {
  if (!actorId) return 'deleted account';
  if (meId && actorId === meId) return 'you';
  return actorId.slice(0, 8);
}
