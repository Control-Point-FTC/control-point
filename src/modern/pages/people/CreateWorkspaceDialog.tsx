// "New workspace" as a dialog (Workspaces tab and the workspace switcher).
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../components/ui-kit';
import { notify } from '../../../components/dialog';
import { CreateWorkspaceForm, type CreateWorkspaceInput } from './CreateWorkspaceForm';

export function CreateWorkspaceDialog({ open, onOpenChange, onAddTeam }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Creates it and switches there; rejects with the server's answer. */
  onAddTeam: (input: CreateWorkspaceInput) => Promise<any>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>Start with your FTC team number. You’ll switch to the workspace once it’s created.</DialogDescription>
        </DialogHeader>
        {open && (
          <CreateWorkspaceForm
            autoFocus
            onCreate={async (input) => {
              const data = await onAddTeam(input);
              notify(`Workspace "${data?.team?.name || 'new'}" created`, 'success');
              onOpenChange(false);
            }}
            onRequested={(name) => {
              notify(`Request sent — someone on ${name} will let you in.`, 'success');
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
