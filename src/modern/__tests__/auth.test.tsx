import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, screen, cleanup, fireEvent, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));

import { ModernLanding } from '../pages/auth/ModernLanding';
import { OAuthSignupPage, RolePage, SignInPage, SignupPage, VerifyEmailPage } from '../pages/auth/AuthPages';
import { CodeRevealDialog } from '../pages/auth/CodeRevealDialog';
import { AuthLayout } from '../pages/auth/AuthLayout';
import { notify } from '../../components/dialog';
import { readDeviceMode, useSignedOutMode } from '../signedOut';
import { clearDrafts } from '../drafts';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
globalThis.IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } } as any;
const json = (body: any, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 400, json: async () => body });
const calls = (url: string) => api.apiFetch.mock.calls.filter((c) => c[0] === url);
const body = (url: string) => JSON.parse(calls(url).at(-1)![1].body);
const fetchMock = vi.fn();

beforeEach(() => {
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation(() => json({}));
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ name: 'Hypnotic Robotics', schoolName: 'River Dell' }) }));
  globalThis.fetch = fetchMock as any;
  clearDrafts();
  localStorage.clear();
  delete document.documentElement.dataset.ui;
});
afterEach(cleanup);

const providers = { google: true, discord: false, github: true };

describe('Modern signed-out look', () => {
  it('follows the look this device last used, else the default', () => {
    expect(readDeviceMode()).toBe('legacy');
    localStorage.setItem('cp-interface-mode', 'modern');
    expect(readDeviceMode()).toBe('modern');
    localStorage.setItem('cp-interface-mode', 'nonsense');
    expect(readDeviceMode()).toBe('legacy');
  });

  it('switching to Classic is remembered, and signing out picks up the session look', () => {
    localStorage.setItem('cp-interface-mode', 'modern');
    const h = renderHook(({ signedIn }) => useSignedOutMode(signedIn), { initialProps: { signedIn: false } });
    expect(h.result.current[0]).toBe('modern');
    act(() => h.result.current[1]('legacy'));
    expect(h.result.current[0]).toBe('legacy');
    expect(localStorage.getItem('cp-interface-mode')).toBe('legacy');
    h.rerender({ signedIn: true });
    localStorage.setItem('cp-interface-mode', 'modern'); // the signed-in provider mirrors the account's look
    h.rerender({ signedIn: false });
    expect(h.result.current[0]).toBe('modern');
  });

  it('landing: turns on the Modern tokens while shown, and both exits work', () => {
    const onSignIn = vi.fn(); const onGetStarted = vi.fn(); const onClassic = vi.fn();
    const v = render(<ModernLanding onSignIn={onSignIn} onGetStarted={onGetStarted} onClassic={onClassic} />);
    expect(document.documentElement.dataset.ui).toBe('modern');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    fireEvent.click(screen.getByRole('button', { name: /Create your workspace/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use the Classic look' }));
    expect(onSignIn).toHaveBeenCalled();
    expect(onGetStarted).toHaveBeenCalled();
    expect(onClassic).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    v.unmount();
    expect(document.documentElement.dataset.ui).toBeUndefined();
  });
});

describe('Modern sign in', () => {
  const setup = (over: Partial<Parameters<typeof SignInPage>[0]> = {}) => {
    const p = {
      email: '', setEmail: vi.fn(), password: '', setPassword: vi.fn(), needsSetup: false, error: null, busy: false,
      onSubmit: vi.fn((e: any) => e.preventDefault()), oauthError: null, providers,
      showForgot: false, setShowForgot: vi.fn(), onPasswordReset: vi.fn(), onBack: vi.fn(), onCreateAccount: vi.fn(), onClassic: vi.fn(),
      ...over,
    };
    render(<SignInPage {...p} />);
    return p;
  };

  it('submits through App, shows its error and offers the enabled providers only', () => {
    const p = setup({ email: 'a@b.test', password: 'pw', error: 'Invalid password' });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'x@y.test' } });
    expect(p.setEmail).toHaveBeenCalledWith('x@y.test');
    fireEvent.click(screen.getByRole('button', { name: /Sign in/ }));
    expect(p.onSubmit).toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid password');
    expect(screen.getByRole('link', { name: 'Continue with Google' }).getAttribute('href')).toMatch(/\/api\/auth\/google\?intent=login$/);
    expect(screen.getByRole('link', { name: 'Continue with GitHub' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continue with Discord' })).not.toBeInTheDocument();
  });

  it('first-time setup asks only for the new password', () => {
    setup({ needsSetup: true });
    expect(screen.getByRole('heading', { name: 'Set your password' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Continue with/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete setup' })).toBeInTheDocument();
  });

  it('password can be shown', () => {
    setup({ password: 'secret' });
    const pw = screen.getByLabelText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(pw).toHaveAttribute('type', 'text');
  });

  it('forgot password: email → code → new password', async () => {
    const p = setup({ email: 'ada@x.test', showForgot: true });
    api.apiFetch.mockImplementation((url: string) => json(url === '/api/auth/forgot-password' ? { cooldownSeconds: 60 } : {}));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByLabelText('Email')).toHaveValue('ada@x.test');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Send code' }));
    await waitFor(() => expect(body('/api/auth/forgot-password')).toEqual({ email: 'ada@x.test' }));
    fireEvent.change(await within(dlg).findByLabelText('Reset code'), { target: { value: '12a3456789' } });
    expect(within(dlg).getByLabelText('Reset code')).toHaveValue('123456');
    expect(within(dlg).getByText('Resend code in 60s')).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Continue' }));
    fireEvent.change(await within(dlg).findByLabelText('New password'), { target: { value: 'newpass' } });
    fireEvent.change(within(dlg).getByLabelText('Confirm password'), { target: { value: 'nope' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Update password' }));
    expect(await within(dlg).findByRole('alert')).toHaveTextContent("Passwords don't match.");
    fireEvent.change(within(dlg).getByLabelText('Confirm password'), { target: { value: 'newpass' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Update password' }));
    await waitFor(() => expect(p.onPasswordReset).toHaveBeenCalled());
    expect(body('/api/auth/reset-password')).toEqual({ email: 'ada@x.test', code: '123456', newPassword: 'newpass' });
  });
});

describe('Modern signup', () => {
  it('role choice', () => {
    const onSelect = vi.fn();
    render(<RolePage providers={providers} onBack={vi.fn()} onSelect={onSelect} onClassic={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /I'm joining a team/ }));
    expect(onSelect).toHaveBeenCalledWith('student');
    expect(screen.getByRole('link', { name: 'Continue with Google' }).getAttribute('href')).toMatch(/intent=signup$/);
  });

  it('admin: the FTC number fills the team name, and the payload matches Classic', async () => {
    const onSignup = vi.fn(async () => ({ team: { id: 1 } }));
    const onDone = vi.fn();
    render(<SignupPage mode="admin" onBack={vi.fn()} onSignup={onSignup} onDone={onDone} onSignIn={vi.fn()} onClassic={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@x.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByLabelText('FTC team number'), { target: { value: '4215' } });
    expect(await screen.findByText('Hypnotic Robotics', {}, { timeout: 2000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ team: { id: 1 } }));
    expect(onSignup).toHaveBeenCalledWith({ accountType: 'admin', name: 'Ada', email: 'ada@x.test', password: 'secret1', teamName: 'Hypnotic Robotics', teamNumber: '4215', accessCode: '' });
  });

  it('an unknown number falls back to a typed name; a drafted name survives coming back', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, json: async () => ({}) }));
    const first = render(<SignupPage mode="admin" onBack={vi.fn()} onSignup={vi.fn()} onDone={vi.fn()} onSignIn={vi.fn()} onClassic={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('FTC team number'), { target: { value: '99999' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Enter your team name instead' }, { timeout: 2000 }));
    fireEvent.change(screen.getByLabelText('Team name'), { target: { value: 'Garage Bots' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret1' } });
    first.unmount();
    render(<SignupPage mode="admin" onBack={vi.fn()} onSignup={vi.fn()} onDone={vi.fn()} onSignIn={vi.fn()} onClassic={vi.fn()} />);
    expect(screen.getByLabelText('FTC team number')).toHaveValue('99999');
    expect(await screen.findByLabelText('Team name')).toHaveValue('Garage Bots');
    expect(screen.getByLabelText('Password')).toHaveValue(''); // passwords are never kept
  });

  it('student: a signup error shows and the button comes back', async () => {
    const onSignup = vi.fn(async () => { throw new Error('Invalid access code'); });
    render(<SignupPage mode="student" onBack={vi.fn()} onSignup={onSignup} onDone={vi.fn()} onSignIn={vi.fn()} onClassic={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Bo' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bo@x.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByLabelText('Team access code'), { target: { value: 'CP-AAAA-BBBB' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join team' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid access code');
    expect(screen.getByRole('button', { name: 'Join team' })).toBeEnabled();
    expect(onSignup).toHaveBeenCalledWith(expect.objectContaining({ accountType: 'student', accessCode: 'CP-AAAA-BBBB' }));
  });

  it('OAuth: picks a role, then completes with the same request as Classic', async () => {
    const onDone = vi.fn();
    api.apiFetch.mockImplementation(() => json({ sessionId: 's', user: { id: 1 } }));
    render(<OAuthSignupPage token="tok" intent="signup" provider="github" onBack={vi.fn()} onDone={onDone} onClassic={vi.fn()} />);
    expect(screen.getByText(/signed in with GitHub/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Joining a team/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.change(screen.getByLabelText('Team access code'), { target: { value: 'CP-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join team' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(body('/api/auth/oauth/complete')).toEqual({ provider: 'github', token: 'tok', teamName: '', teamNumber: '', accessCode: 'CP-1', role: 'student' });
    fireEvent.click(screen.getByRole('radio', { name: /Team admin/ }));
    expect(screen.getByLabelText('FTC team number')).toBeInTheDocument();
  });

  it('verify email: six digits, then the session goes to App', async () => {
    const onVerified = vi.fn();
    api.apiFetch.mockImplementation(() => json({ sessionId: 's', user: { id: 1 } }));
    render(<VerifyEmailPage email="ada@x.test" onBack={vi.fn()} onVerified={onVerified} onClassic={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));
    expect(api.apiFetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));
    await waitFor(() => expect(onVerified).toHaveBeenCalledWith({ sessionId: 's', user: { id: 1 } }));
    expect(body('/api/auth/verify-email')).toEqual({ email: 'ada@x.test', code: '654321' });
  });
});

describe('Modern workspace-ready dialog', () => {
  it('shows the code and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const onEnter = vi.fn();
    render(<CodeRevealDialog team={{ name: 'Robo', access_code: 'CP-AB12', verified: true }} onEnter={onEnter} />);
    expect(screen.getByLabelText('CP-AB12')).toBeInTheDocument();
    expect(screen.getByText('Verified FTC team')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Copy code/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('CP-AB12'));
    expect(await screen.findByText('Copied')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enter workspace' }));
    expect(onEnter).toHaveBeenCalled();
  });
});

describe('Phase 9b review fixes', () => {
  it("an old number's lookup can't verify the number now in the field", async () => {
    const replies: Record<string, (v: any) => void> = {};
    fetchMock.mockImplementation((u: string) => new Promise((r) => { replies[new URL(u, 'http://x').searchParams.get('number')!] = r; }));
    render(<SignupPage mode="admin" onBack={vi.fn()} onSignup={vi.fn()} onDone={vi.fn()} onSignIn={vi.fn()} onClassic={vi.fn()} />);
    const num = screen.getByLabelText('FTC team number');
    fireEvent.change(num, { target: { value: '4215' } });
    await waitFor(() => expect(replies['4215']).toBeDefined(), { timeout: 2000 });
    fireEvent.change(num, { target: { value: '42150' } }); // next lookup not started yet (600 ms delay)
    await act(async () => { replies['4215']({ ok: true, json: async () => ({ name: 'Wrong Team' }) }); });
    expect(screen.queryByText('Wrong Team')).not.toBeInTheDocument();
    expect(screen.queryByText('Verified FTC team')).not.toBeInTheDocument();
    await waitFor(() => expect(replies['42150']).toBeDefined(), { timeout: 2000 });
    await act(async () => { replies['42150']({ ok: true, json: async () => ({ name: 'Right Team' }) }); });
    expect(await screen.findByText('Right Team')).toBeInTheDocument();
  });

  it('a pasted code with spaces keeps all six digits', async () => {
    render(<VerifyEmailPage email="ada@x.test" onBack={vi.fn()} onVerified={vi.fn()} onClassic={vi.fn()} />);
    const input = screen.getByLabelText('Verification code');
    const user = userEvent.setup();
    await user.click(input);
    await user.paste('123 456');
    expect(input).toHaveValue('123456');
  });

  it('highlights can be paused, and stay still with reduced motion', async () => {
    vi.useFakeTimers();
    try {
      render(<AuthLayout><p>form</p></AuthLayout>);
      const first = screen.getByText('Check in with one scan');
      fireEvent.click(screen.getByRole('button', { name: 'Pause highlights' }));
      await act(async () => { vi.advanceTimersByTime(12000); });
      expect(first).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Play highlights' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Show: Scout smarter' }));
      expect(screen.getByRole('button', { name: 'Show: Scout smarter' })).toHaveAttribute('aria-current', 'true');
    } finally {
      vi.useRealTimers();
    }
    cleanup();
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as any;
    try {
      vi.useFakeTimers();
      render(<AuthLayout><p>form</p></AuthLayout>);
      expect(screen.queryByRole('button', { name: /Pause highlights/ })).not.toBeInTheDocument();
      await act(async () => { vi.advanceTimersByTime(12000); });
      expect(screen.getByText('Check in with one scan')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
      window.matchMedia = mm;
    }
  });
});

describe('signed-out toasts', () => {
  it('a notify on a Modern signed-out screen is shown (e.g. after a password reset)', async () => {
    render(<AuthLayout><p>form</p></AuthLayout>);
    act(() => notify('Password updated — sign in with your new password', 'success'));
    expect(await screen.findByText('Password updated — sign in with your new password')).toBeInTheDocument();
  });
});

