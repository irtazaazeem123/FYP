// src/components/Auth/SignupPage.jsx
import React, { useEffect, useState } from 'react';
import './SignupPage.css';
import { useNavigate } from 'react-router-dom';
import Logo3D from '../Three/Logo3D';

const API_BASE = 'http://127.0.0.1:8000';

const SignupPage = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
    dob: ''
  });

  // step: 'form' | 'verify' | 'success'
  const [step, setStep] = useState('form');

  const [code, setCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // resend cooldown (seconds)
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let id;
    if (cooldown > 0) {
      id = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    }
    return () => id && clearInterval(id);
  }, [cooldown]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // STEP 1: send signup data -> backend sends email code
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    if (form.password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          first_name: form.firstName,
          last_name: form.lastName,
          password: form.password,
          date_of_birth: form.dob
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.detail || 'Signup failed.');
        return;
      }

      setStep('verify');
      setInfoMsg('We sent a 4-digit verification code to your email. It expires in 10 minutes.');
      setCooldown(60); // 1 minute cooldown
    } catch (err) {
      setErrorMsg('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // STEP 2: verify code
  const handleVerify = async () => {
    setErrorMsg('');
    setInfoMsg('');

    if (code.trim().length !== 4) {
      setErrorMsg('Please enter the 4-digit code.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, code: code.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.detail || 'Verification failed.');
        return;
      }

      setStep('success');
      setInfoMsg('Your email has been verified. You can now sign in.');
    } catch {
      setErrorMsg('Could not verify code. Please try again.');
    }
  };

  // resend code
  const handleResend = async () => {
    if (cooldown > 0) return;
    setErrorMsg('');
    setInfoMsg('');

    try {
      const res = await fetch(`${API_BASE}/auth/resend-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email })
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.detail || 'Could not resend code.');
        return;
      }
      setInfoMsg('New code sent. It will expire in 10 minutes.');
      setCooldown(60);
    } catch {
      setErrorMsg('Could not resend code. Please try again.');
    }
  };

  return (
    <div className="su-wrapper">
      {/* Top bar */}
      <div className="su-topbar">
        <div className="su-topbar-inner">
          <div className="su-brand">
            <Logo3D />
            <span className="su-brand-name">Automated Domain Expert Chatbot</span>
          </div>

          <button
            className="su-home-btn"
            onClick={() => navigate('/')}
            aria-label="Go to Login"
          >
            Home
          </button>
        </div>
      </div>

      <div className="su-container">
        <div className="su-card">
          <h2 className="su-title">Create your account</h2>

          {step === 'form' && (
            <form onSubmit={handleSubmit}>
              <input
                className="su-input"
                type="email"
                name="email"
                placeholder="Email address"
                value={form.email}
                onChange={handleChange}
                required
              />

              <div className="su-grid-2">
                <input
                  className="su-input"
                  type="text"
                  name="firstName"
                  placeholder="First name"
                  value={form.firstName}
                  onChange={handleChange}
                  required
                />
                <input
                  className="su-input"
                  type="text"
                  name="lastName"
                  placeholder="Last name"
                  value={form.lastName}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="su-grid-2">
                <input
                  className="su-input"
                  type="password"
                  name="password"
                  placeholder="Password (min 6 chars)"
                  value={form.password}
                  onChange={handleChange}
                  required
                />
                <input
                  className="su-input"
                  type="password"
                  name="confirmPassword"
                  placeholder="Confirm password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  required
                />
              </div>

              <input
                className="su-input"
                type="date"
                name="dob"
                value={form.dob}
                onChange={handleChange}
                required
              />

              {errorMsg && <p className="su-error">{errorMsg}</p>}

              <button type="submit" className="su-primary-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Sending code…' : 'Sign up'}
              </button>
            </form>
          )}

          {step === 'verify' && (
            <div>
              <p style={{ color: '#9aa3b2', marginBottom: 10 }}>
                We sent a code to <strong style={{ color: '#e7e9f0' }}>{form.email}</strong>
              </p>

              <input
                className="su-input"
                type="text"
                maxLength={4}
                placeholder="4-digit verification code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />

              {infoMsg && (
                <p style={{ color: '#cfe0ff', marginTop: 4 }}>{infoMsg}</p>
              )}
              {errorMsg && <p className="su-error">{errorMsg}</p>}

              <button
                type="button"
                className="su-primary-btn"
                onClick={handleVerify}
              >
                Verify email
              </button>

              <div style={{ marginTop: 10, fontSize: '.9rem', color: '#9aa3b2' }}>
                Didn’t get the code?
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '.85rem', marginLeft: 8 }}
                  onClick={handleResend}
                  disabled={cooldown > 0}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="su-popup">
              <p>{infoMsg || 'Registration successful!'}</p>
              <button
                className="su-primary-btn"
                onClick={() => navigate('/')}
              >
                Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
