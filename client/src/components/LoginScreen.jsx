import React, { useState } from 'react';
import { GraduationCap, Lock, Mail, KeyRound } from 'lucide-react';
import { login, register } from '../lib/api';

export default function LoginScreen({ onBack, onHome, onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName]             = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [examTrack, setExamTrack]   = useState('JEE');
  const [targetYear, setTargetYear] = useState(2027);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);

  const authenticate = async (creds) => {
    setError(''); setLoading(true);
    try {
      if (isRegister) {
        if (name.trim().length < 2) throw new Error('Enter your full name.');
        const d = await register(name.trim(), creds.email, creds.password, examTrack, Number(targetYear));
        onLoginSuccess(d.user);
      } else {
        const d = await login(creds.email, creds.password);
        onLoginSuccess(d.user);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const t = email.trim();
    if (!t) { setError('Enter your email.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) { setError('Enter a valid email.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    await authenticate({ email: t, password });
  };

  return (
    <main className="loginShell">
      <section className="loginPanel" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* Brand Header */}
        <button className="brandBlock brandButton loginBrand" type="button" onClick={onHome}>
          <div className="brandMark">
            <GraduationCap size={21} />
          </div>
          <div>
            <p className="eyebrow">DecisionVault</p>
            <h1>CollegeVault</h1>
          </div>
        </button>

        {/* Back navigation */}
        <button className="textButton" type="button" onClick={onBack} style={{ marginBottom: '20px' }}>
          Back to home
        </button>

        {/* Lock Icon */}
        <div className="loginIcon">
          <Lock size={22} />
        </div>

        <p className="eyebrow">Secure login</p>
        <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>
          {isRegister ? 'Create your CollegeVault account' : 'Open your CollegeVault workspace.'}
        </h2>
        
        {error && (
          <div className="errorMessage" style={{ color: '#ff4d4f', margin: '10px 0', fontSize: '0.9em', fontWeight: 'bold' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="loginForm" noValidate style={{ width: '100%' }}>
          {isRegister && (
            <label>
              Full name
              <input 
                value={name} 
                onChange={e => setName(e.target.value)} 
                required 
                placeholder="Student Name" 
              />
            </label>
          )}

          <label>
            Email
            <input 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
              type="email" 
              placeholder="name@example.com"
            />
          </label>

          <label>
            Password
            <input 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
              type="password" 
              placeholder="••••••••"
            />
          </label>

          {isRegister && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <label>
                Exam Track
                <select value={examTrack} onChange={e => setExamTrack(e.target.value)} style={{ cursor: 'pointer' }}>
                  <option>JEE</option><option>CUET</option><option>NEET</option>
                  <option>GATE</option><option>CAT</option><option>Other</option>
                </select>
              </label>
              <label>
                Target Year
                <input value={targetYear} onChange={e => setTargetYear(e.target.value)} type="number" min="2026" max="2035" required />
              </label>
            </div>
          )}

          <button className="primaryAction" type="submit" disabled={loading}>
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
