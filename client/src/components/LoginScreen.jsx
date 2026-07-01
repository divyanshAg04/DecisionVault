import React, { useState } from 'react';
import { GraduationCap, Lock } from 'lucide-react';
import { login, register } from '../lib/api';

export default function LoginScreen({ onBack, onHome, onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [examTrack, setExamTrack] = useState('JEE');
  const [targetYear, setTargetYear] = useState(2027);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const authenticate = async (credentials) => {
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        if (name.trim().length < 2) {
          throw new Error('Enter your full name.');
        }
        const data = await register(name.trim(), credentials.email, credentials.password, examTrack, Number(targetYear));
        onLoginSuccess(data.user);
      } else {
        const data = await login(credentials.email, credentials.password);
        onLoginSuccess(data.user);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Enter your email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    await authenticate({ email: trimmedEmail, password });
  };

  return (
    <main className="loginShell">
      <section className="loginPanel">
        <button className="brandBlock brandButton loginBrand" type="button" onClick={onHome}>
          <div className="brandMark">
            <GraduationCap size={21} />
          </div>
          <div>
            <p className="eyebrow">DecisionVault</p>
            <h1>CollegeVault</h1>
          </div>
        </button>
        <button className="textButton" type="button" onClick={onBack}>
          Back to home
        </button>
        <div className="loginIcon">
          <Lock size={22} />
        </div>
        <p className="eyebrow">Secure login</p>
        <h2>{isRegister ? 'Create your CollegeVault account' : 'Open your CollegeVault workspace.'}</h2>
        
        {error && <div className="errorMessage" style={{ color: '#ff4d4d', margin: '10px 0', fontSize: '0.9em', fontWeight: 'bold' }}>{error}</div>}

        <form onSubmit={handleSubmit} className="loginForm" noValidate style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
          {isRegister && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
              Full name
              <input value={name} onChange={e => setName(e.target.value)} required placeholder="Student Name" style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ced4da' }} />
            </label>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
            Email
            <input value={email} onChange={e => setEmail(e.target.value)} required type="email" style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ced4da' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
            Password
            <input value={password} onChange={e => setPassword(e.target.value)} required type="password" style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ced4da' }} />
          </label>
          {isRegister && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                Exam Track
                <select value={examTrack} onChange={e => setExamTrack(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ced4da' }}>
                  <option>JEE</option>
                  <option>CUET</option>
                  <option>NEET</option>
                  <option>GATE</option>
                  <option>CAT</option>
                  <option>Other</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                Target Year
                <input value={targetYear} onChange={e => setTargetYear(e.target.value)} type="number" min="2026" max="2035" required style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ced4da' }} />
              </label>
            </div>
          )}
          <button className="primaryAction" type="submit" disabled={loading} style={{ padding: '10px', marginTop: '10px' }}>
            {loading ? 'Please wait...' : (isRegister ? 'Register & Continue' : 'Login')}
          </button>
        </form>

        <button className="textButton" type="button" onClick={() => { setIsRegister(!isRegister); setError(''); }} style={{ marginTop: '15px', textDecoration: 'underline' }}>
          {isRegister ? 'Already have an account? Log in' : "Don't have an account? Register"}
        </button>
      </section>
    </main>
  );
}
