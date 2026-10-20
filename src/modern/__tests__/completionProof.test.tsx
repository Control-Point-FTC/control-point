// Proof of completion with Bruno's check: the task's proof setting sets the
// hint and what "Mark done" needs (nothing, for a task that needs no proof),
// a link counts as proof, phones get a camera button, and Bruno's follow-up
// question shows above the note while he's waiting on an answer.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CompletionDialog } from '../pages/tasks/TaskDialogs';

afterEach(cleanup);

function show(task: any, props: Partial<Parameters<typeof CompletionDialog>[0]> = {}) {
  return render(
    <CompletionDialog task={{ id: 1, title: 'Wire the hub', ...task }} notes="" onNotesChange={() => {}} link="" onLinkChange={() => {}}
      files={[]} onFilesChange={vi.fn()} completing={false} onSubmit={() => {}} onClose={() => {}} {...props} />,
  );
}
const markDone = () => screen.getByRole('button', { name: /Mark done|Send answer|Bruno is checking/ });

describe('completion proof', () => {
  it('a task that needs no proof can be marked done empty', () => {
    show({ proof_requirement: 'none' });
    expect(screen.getByText(/No proof needed/)).toBeTruthy();
    expect((markDone() as HTMLButtonElement).disabled).toBe(false);
  });

  it('other tasks need a note, a photo or a link', () => {
    show({ proof_requirement: 'auto' });
    expect((markDone() as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    show({ proof_requirement: 'link' }, { link: 'https://github.com/team/robot' });
    expect(screen.getByText(/Link to the work/)).toBeTruthy();
    expect((markDone() as HTMLButtonElement).disabled).toBe(false);
  });

  it('has a camera button that opens the back camera on phones', () => {
    show({});
    expect(screen.getByText('Camera')).toBeTruthy();
    expect(document.body.querySelector('input[capture="environment"]')).toBeTruthy();
  });

  it("shows Bruno's question and waits for the answer", () => {
    show({}, { notes: 'Tuned it', aiQuestion: 'Which values did you change?' });
    expect(screen.getByRole('alert').textContent).toMatch(/Which values did you change\?/);
    expect(markDone().textContent).toMatch(/Send answer/);
  });

  it('says Bruno is checking while he reads it', () => {
    show({}, { notes: 'Tuned the PID', verifying: true });
    expect(markDone().textContent).toMatch(/Bruno is checking/);
    expect((markDone() as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
