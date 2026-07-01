import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginScreen from './LoginScreen';
import { login, register } from '../lib/api';

vi.mock('../lib/api', () => ({
  login: vi.fn(),
  register: vi.fn(),
}));

function renderLogin(overrides = {}) {
  return render(
    <LoginScreen
      onBack={vi.fn()}
      onHome={vi.fn()}
      onLoginSuccess={vi.fn()}
      {...overrides}
    />,
  );
}

describe('LoginScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts empty and shows inline validation for missing email', async () => {
    const user = userEvent.setup();
    renderLogin();

    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('logs in with the demo account button', async () => {
    const user = userEvent.setup();
    const onLoginSuccess = vi.fn();
    login.mockResolvedValue({ user: { name: 'Demo Student' } });
    renderLogin({ onLoginSuccess });

    await user.click(screen.getByRole('button', { name: 'Try demo account' }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('demo@decisionvault.dev', 'Password123');
      expect(onLoginSuccess).toHaveBeenCalledWith({ name: 'Demo Student' });
    });
  });

  it('validates register name before calling the API', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: "Don't have an account? Register" }));
    await user.type(screen.getByLabelText('Email'), 'new@student.dev');
    await user.type(screen.getByLabelText('Password'), 'Password123');
    await user.click(screen.getByRole('button', { name: 'Register & Continue' }));

    expect(await screen.findByText('Enter your full name.')).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });
});
