// src/components/Auth/PasswordPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import './SignupPage.css';
import Logo3D from '../Three/Logo3D';

const API_BASE = 'http://127.0.0.1:8000';

const PasswordPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const storedEmail = location.state?.email;
    if (storedEmail) {
      setEmail(storedEmail);
    } else {
      navigate('/'); // back to login if direct access
    }
  }, [location.state, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Login failed');

      // Save email + first name for later use
      localStorage.setItem('user_email', data.email || email);
      if (data.first_name) {
        localStorage.setItem('user_first', data.first_name);
      }

      navigate('/upload');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="signup-wrapper">
      <div className="su-topbar">
        <div className="su-topbar-inner">
          <div className="su-brand">
            <div className="logo-canvas-container">
              <Logo3D />
            </div>
            <span className="su-brand-name">
              Automated Domain Expert Chatbot
            </span>
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

      <div className="signup-container">
        <form
          className="signup-box scale-in-center"
          onSubmit={handleLogin}
          aria-labelledby="pw-title"
        >
          <h2 id="pw-title" className="signup-title">
            Enter your password
          </h2>

          <div
            style={{
              color: '#9aa3b2',
              fontSize: '0.92rem',
              marginBottom: '0.75rem',
            }}
          >
            Signing in as{' '}
            <strong style={{ color: '#e7e9f0' }}>{email}</strong>
          </div>

          <label htmlFor="password" className="visually-hidden">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="signup-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {error && (
            <p className="fade-in" style={{ color: 'salmon', marginTop: 6 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            className="register-btn"
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '12px',
              fontSize: '0.92rem',
              color: '#9aa3b2',
            }}
          >
            <Link
              to="/"
              style={{ color: '#8ab4ff', textDecoration: 'none' }}
            >
              Back to email
            </Link>
            <Link
              to="/"
              style={{ color: '#8ab4ff', textDecoration: 'none' }}
            >
              Forgot password?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PasswordPage;
