import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act, within } from '@testing-library/react';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { InterfaceModeProvider } from '../interfaceMode';
import { WelcomeDialog } from '../pages/onboarding/WelcomeDialog';
import { SetupDialog } from '../pages/onboarding/SetupDialog';
import { TourCard } from '../pages/onboarding/TourCard';
import SetupWizard from '../../components/onboarding/SetupWizard';
import Walkthrough from '../../components/onboarding/Walkthrough';
import { clearTourDraft } from '../../components/onboarding/useWalkthrough';
import { defaultOnboardingState, type OnboardingState, type TourStep } from '../../components/onboarding/onboardingState';
import { clearSetupDrafts } from '../../components/onboarding/useSetupWizard';
import { clearDrafts } from '../drafts';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }),
});
const json = (body: any, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 400, json: async () => body });

beforeEach(() => {
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation((_u: string, init?: any) => json({ user: { id: 7, name: 'Ada', ...(init?.body ? JSON.parse(init.body) : {}) } }));
  dialog.confirmDialog.mockReset();
  dialog.confirmDialog.mockResolvedValue(true);
  dialog.notify.mockReset();
  clearDrafts();
});
afterEach(cleanup);

const me = { id: 7, name: 'Ada', interface_mode: 'modern' };
const setupProps = (over: Record<string, unknown> = {}) => ({
  user: { name: '', role: '' },
  state: defaultOnboardingState(),
  onPatchState: vi.fn(async () => defaultOnboardingState() as OnboardingState),
  onSaveProfile: vi.fn(async () => undefined),
  onProfileChanged: vi.fn(),
  onStartTour: vi.fn(),
  onClose: vi.fn(),
  ...over,
});

describe('Modern welcome', () => {
  it('greets by first name; Get started and Skip report back', () => {
    const onGetStarted = vi.fn(); const onSkip = vi.fn();
    render(<WelcomeDialog userName="Ada Lovelace" onGetStarted={onGetStarted} onSkip={onSkip} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Welcome,Ada.');
    expect(screen.getByText('A one-minute tour')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Get started/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(onGetStarted).toHaveBeenCalled();
    expect(onSkip).toHaveBeenCalled();
  });
});

describe('Modern setup', () => {
  const mount = (p = setupProps(), user = me) => render(
    <InterfaceModeProvider user={user} team={{}} onUserSaved={() => {}}><SetupDialog {...(p as any)} /></InterfaceModeProvider>,
  );

  it('saves the profile, then the look, tour and summary steps', async () => {
    const p = setupProps();
    mount(p);
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Your profile');
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Alex Rivera' } });
    fireEvent.change(screen.getByLabelText(/Role or title/), { target: { value: 'Build captain' } });
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/ }));
    await waitFor(() => expect(p.onSaveProfile).toHaveBeenCalledWith({ name: 'Alex Rivera', role: 'Build captain' }));
    expect(p.onProfileChanged).toHaveBeenCalledWith('Alex Rivera', 'Build captain');
    expect(await screen.findByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Maybe later' }));
    await waitFor(() => expect(p.onPatchState).toHaveBeenLastCalledWith(expect.objectContaining({ steps: { tour: expect.objectContaining({ status: 'skipped' }) } })));
    expect(await screen.findByText('Skipped')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start using Control Point' }));
    expect(p.onClose).toHaveBeenCalled();
  });

  it('a blank name is rejected with an announced error', async () => {
    const p = setupProps();
    mount(p);
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/ }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(p.onSaveProfile).not.toHaveBeenCalled();
  });

  it('the theme applies at once, and Classic layout is saved to the account', async () => {
    mount(setupProps({ initialStep: 1 }));
    fireEvent.click(screen.getByRole('radio', { name: /Light/ }));
    expect(document.documentElement.classList.contains('light')).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Dark/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Classic/ }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ method: 'PATCH' })));
    expect(JSON.parse(api.apiFetch.mock.calls.at(-1)![1].body).interface_mode).toBe('legacy');
  });

  it('a look switch mid-setup carries on in Classic with the typed name and the same step', async () => {
    const p = setupProps();
    const first = mount(p);
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Half typed' } });
    first.unmount();
    render(<SetupWizard {...(p as any)} />);
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Half typed');
    cleanup();
    clearSetupDrafts();
    mount(p);
    expect(screen.getByLabelText('Display name')).toHaveValue('');
  });

  it('closing with unsaved edits asks inside the dialog (Keep editing / Leave)', async () => {
    const p = setupProps();
    mount(p);
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'x' } });
    fireEvent.keyDown(screen.getByLabelText('Display name'), { key: 'Escape' });
    const ask = await screen.findByRole('alertdialog', { name: 'Leave setup?' });
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(p.onClose).not.toHaveBeenCalled();
    expect(dialog.confirmDialog).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('Display name'), { key: 'Escape' });
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(p.onClose).toHaveBeenCalled());
  });

  it('while asking, the form behind the question is inert', async () => {
    mount(setupProps());
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'x' } });
    fireEvent.keyDown(screen.getByLabelText('Display name'), { key: 'Escape' });
    await screen.findByRole('alertdialog');
    expect(screen.getByLabelText('Display name').closest('[inert]')).not.toBeNull();
    expect(screen.getByRole('navigation', { hidden: true }).hasAttribute('inert')).toBe(true);
    expect(screen.getByRole('button', { name: 'Keep editing' }).closest('[inert]')).toBeNull();
  });

  it("an old setup's failed layout save doesn't show its error in a reopened setup", async () => {
    let fail: () => void = () => {};
    api.apiFetch.mockImplementation(() => new Promise((r) => { fail = () => r({ ok: false, status: 500, json: async () => ({}) }); }));
    const first = mount(setupProps({ initialStep: 1 }));
    fireEvent.click(screen.getByRole('radio', { name: /Classic/ }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalled());
    first.unmount();
    clearSetupDrafts();
    mount(setupProps({ initialStep: 1 }));
    await act(async () => { fail(); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a save that lands after setup closed never moves a reopened setup', async () => {
    let finish: () => void = () => {};
    const p = setupProps({ onSaveProfile: vi.fn(() => new Promise<void>((r) => { finish = () => r(); })) });
    const first = mount(p);
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Alex' } });
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/ }));
    await waitFor(() => expect(p.onSaveProfile).toHaveBeenCalled());
    first.unmount();
    clearSetupDrafts(); // App does this when setup closes
    mount(setupProps());
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Unfinished' } });
    await act(async () => { finish(); });
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Your profile');
    expect(screen.getByLabelText('Display name')).toHaveValue('Unfinished');
  });

  it("a layout that couldn't be saved says so", async () => {
    api.apiFetch.mockImplementation(() => json({ error: 'nope' }, false));
    mount(setupProps({ initialStep: 1 }));
    fireEvent.click(screen.getByRole('radio', { name: /Classic/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save your layout");
    expect(dialog.notify).toHaveBeenCalledWith("Couldn't save your layout.", 'error');
  });

  it('the tour step starts or retakes the tour', async () => {
    const p = setupProps({ initialStep: 2 });
    mount(p);
    fireEvent.click(screen.getByRole('button', { name: 'Start the tour' }));
    expect(p.onStartTour).toHaveBeenCalledWith();
    cleanup();
    const done = defaultOnboardingState();
    done.steps.tour.status = 'done';
    const q = setupProps({ initialStep: 2, state: done });
    clearSetupDrafts();
    mount(q);
    fireEvent.click(screen.getByRole('button', { name: 'Retake the tour' }));
    expect(q.onStartTour).toHaveBeenCalledWith(0);
  });
});

describe('Modern tour', () => {
  const STEPS: TourStep[] = [
    { id: 'a', title: 'Step One', body: 'First explanation', target: 'nav-dashboard' },
    { id: 'b', title: 'Step Two', body: 'Second explanation', target: 'nav-missing' },
  ];
  const mount = (over: Record<string, unknown> = {}) => {
    const p = { steps: STEPS, onStepChange: vi.fn(), onFinish: vi.fn(), onExit: vi.fn(), ...over };
    document.body.insertAdjacentHTML('beforeend', '<button data-onboard="nav-dashboard">Dashboard</button>');
    render(<TourCard {...(p as any)} />);
    return p;
  };
  afterEach(() => { document.body.innerHTML = ''; });

  it('walks the steps (missing targets fall back to a centred card) and finishes', async () => {
    const p = mount();
    expect(screen.getByRole('heading', { name: 'Step One' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Tour progress: step 1 of 2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(await screen.findByRole('heading', { name: 'Step Two' })).toBeInTheDocument();
    expect(p.onStepChange).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: /Finish/ }));
    expect(await screen.findByRole('heading', { name: "You're ready" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue setup' }));
    expect(p.onFinish).toHaveBeenCalledWith('setup');
  });

  it('a look switch mid-tour carries on at the same step', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(await screen.findByRole('heading', { name: 'Step Two' })).toBeInTheDocument();
    cleanup();
    render(<Walkthrough steps={STEPS} initialStep={0} onFinish={vi.fn()} onExit={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Step Two' })).toBeInTheDocument();
    cleanup();
    clearTourDraft(); // App does this when the tour closes
    render(<TourCard steps={STEPS} initialStep={0} onFinish={vi.fn()} onExit={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Step One' })).toBeInTheDocument();
  });

  it('dots jump, arrows move and Escape exits', async () => {
    const p = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Go to step 2: Step Two' }));
    expect(await screen.findByRole('heading', { name: 'Step Two' })).toBeInTheDocument();
    act(() => { fireEvent.keyDown(window, { key: 'ArrowLeft' }); });
    expect(await screen.findByRole('heading', { name: 'Step One' })).toBeInTheDocument();
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(p.onExit).toHaveBeenCalled();
  });
});
