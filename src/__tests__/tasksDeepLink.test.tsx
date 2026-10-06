import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TasksView } from '../App';
import { ContextMenuProvider } from '../components/contextmenu/ContextMenuProvider';
import { clearDrafts } from '../modern/drafts';

afterEach(cleanup);
// The task editor lives in the shared draft store; start each case clean.
beforeEach(() => clearDrafts());

const tasks = [
  { id: 1, title: 'Mount the climber hooks', status: 'todo', assignee_ids: [7], team_id: 1 },
  { id: 2, title: 'Print brackets', status: 'in-progress', assignee_ids: [], team_id: 1 },
];

function renderTasks(canManage: boolean) {
  return render(
    <ContextMenuProvider>
      <MemoryRouter initialEntries={['/tasks?task=1']}>
        <TasksView
          tasks={tasks}
          setTasks={() => {}}
          teams={[{ id: 1, name: 'Team' }]}
          members={[{ id: 7, name: 'Ada', team_id: 1 }]}
          onRefresh={() => {}}
          refresh={{ tasks: () => {} }}
          currentUser={{ id: 7, team_id: 1 }}
          hasScope={(s: string) => (s === 'tasks' ? canManage : false)}
          onRequestComplete={() => {}}
        />
      </MemoryRouter>
    </ContextMenuProvider>,
  );
}

describe('Tasks deep link from a notification (/tasks?task=ID)', () => {
  it('opens the matching task in the editor for task managers', async () => {
    renderTasks(true);
    expect(await screen.findByText('Edit Task')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Mount the climber hooks')).toBeInTheDocument();
  });

  it('does not open the editor for members without the tasks permission', () => {
    renderTasks(false);
    expect(screen.queryByText('Edit Task')).not.toBeInTheDocument();
    expect(screen.getAllByText('Mount the climber hooks').length).toBeGreaterThan(0);
  });
});
