/**
 * HATEOAS action descriptors, produced server-side by the fsm_actions()
 * family of RPCs. Hidden means absent, not disabled: if an action is missing
 * from the map, the current user may not perform it in the current state —
 * render nothing. The server re-validates on execution regardless.
 */
export interface WorkflowAction {
  action: string;
  to_state: string;
  label: string;
  requires_comment: boolean;
  destructive: boolean;
}

export type WorkflowActions = Record<string, WorkflowAction>;

export function can(actions: WorkflowActions | null | undefined, action: string): boolean {
  return Boolean(actions?.[action]);
}

export function actionList(actions: WorkflowActions | null | undefined): WorkflowAction[] {
  return Object.values(actions ?? {});
}
