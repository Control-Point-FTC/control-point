import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VerifyEmailScreen from '../VerifyEmailScreen';

afterEach(cleanup);

function mockFetchOnce(json: any, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => json,
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  try { localStorage.clear(); } catch { /* jsdom may lack it in some setups */ }
});

describe('VerifyEmailScreen', () => {
  it('renders the email, code field, and a disabled resend countdown', () => {
    render(<VerifyEmailScreen email="newbie@example.com" onBack={() => {}} onVerified={() => {}} />);
    expect(screen.getByText(/newbie@example\.com/)).toBeInTheDocument();
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    expect(screen.getByText(/resend code in \d+s/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /didn't get it/i })).not.toBeInTheDocument();
  });

  it('submits the 6-digit code and calls onVerified on success', async () => {
    const user = userEvent.setup();
    const onVerified = vi.fn();
    const payload = { user: { id: 1 }, sessionId: 'sess-123', team: { id: 9 } };
    const fetchMock = mockFetchOnce(payload);

    render(<VerifyEmailScreen email="newbie@example.com" onBack={() => {}} onVerified={onVerified} />);
    await user.type(screen.getByLabelText(/verification code/i), '482916');
    await user.click(screen.getByRole('button', { name: /verify email/i }));

    await waitFor(() => expect(onVerified).toHaveBeenCalledWith(payload));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/verify-email');
    expect(JSON.parse((init as any).body)).toEqual({ email: 'newbie@example.com', code: '482916' });
  });

  it('strips non-digits and shows an error for short codes without calling the API', async () => {
    const user = userEvent.setup();
    const onVerified = vi.fn();
    const fetchMock = mockFetchOnce({});

    render(<VerifyEmailScreen email="newbie@example.com" onBack={() => {}} onVerified={onVerified} />);
    await user.type(screen.getByLabelText(/verification code/i), '12ab');
    await user.click(screen.getByRole('button', { name: /verify email/i }));

    expect(await screen.findByText(/enter the 6-digit code/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('shows the server error when the code is wrong', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchOnce({ error: "That code doesn't match — try again" }, false, 400);

    render(<VerifyEmailScreen email="newbie@example.com" onBack={() => {}} onVerified={() => {}} />);
    await user.type(screen.getByLabelText(/verification code/i), '000000');
    await user.click(screen.getByRole('button', { name: /verify email/i }));

    expect(await screen.findByText(/doesn't match/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('calls onBack when the back button is pressed', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<VerifyEmailScreen email="newbie@example.com" onBack={onBack} onVerified={() => {}} />);
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
