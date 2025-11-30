// src/components/Auth/LoginPage.jsx
import React, { useState } from 'react';
import './LoginPage.css';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import Logo3D from '../Three/Logo3D';

const API_BASE = 'http://127.0.0.1:8000';

const LoginPage = () => {
  const navigate = useNavigate();

  // --- Login states ---
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  // NEW: modal when email not registered
  const [showUnregModal, setShowUnregModal] = useState(false);

  // --- Forgot password: email step ---
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailError, setEmailError] = useState('');

  // --- Forgot password: code step ---
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);

  // --- Forgot password: reset step ---
  const [showResetModal, setShowResetModal] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [confirmNewPass, setConfirmNewPass] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  // ---- Email-based login ----
  const handleContinue = async () => {
    if (!email || !email.includes('@')) {
      alert('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/check-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Something went wrong');

      if (data.exists) {
        localStorage.setItem('user_email', email);
        navigate('/password', { state: { email } });
      } else {
        // OLD: alert('Email not found. Please sign up first.');
        // NEW: show popup instead
        setShowUnregModal(true);
      }
    } catch (err) {
      alert(err.message || 'Could not verify email.');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────
  // FORGOT PASSWORD FLOW
  // Step 1: Ask for email
  // ─────────────────────────────
  const openForgotModal = () => {
    setEmailError('');
    setForgotEmail('');
    setShowEmailModal(true);
  };

  const handleForgotEmailSubmit = async () => {
    setEmailError('');
    if (!forgotEmail || !forgotEmail.includes('@')) {
      setEmailError('Please enter a valid email.');
      return;
    }
    setCheckingEmail(true);
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });

      // If backend returns 404 → email not registered
      if (res.status === 404) {
        setEmailError('Email not registered.');
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Check failed.');

      // Success → 4-digit code has been sent to email
      setShowEmailModal(false);
      setResetCode('');
      setCodeError('');
      setShowCodeModal(true);
    } catch (e) {
      setEmailError(e.message || 'Could not verify email.');
    } finally {
      setCheckingEmail(false);
    }
  };

  // ─────────────────────────────
  // Step 2: Verify 4-digit code
  // ─────────────────────────────
  const handleVerifyCode = async () => {
    setCodeError('');

    const trimmed = resetCode.trim();
    if (!trimmed || trimmed.length !== 4) {
      setCodeError('Enter the 4-digit code sent to your email.');
      return;
    }

    setCodeLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-reset-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, code: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCodeError(data.detail || 'Invalid code. Please try again.');
        return;
      }

      // Code correct → open reset password modal
      setShowCodeModal(false);
      setNewPass('');
      setConfirmNewPass('');
      setResetError('');
      setShowResetModal(true);
    } catch (e) {
      setCodeError(e.message || 'Could not verify code.');
    } finally {
      setCodeLoading(false);
    }
  };

  // ─────────────────────────────
  // Step 3: Reset password
  // ─────────────────────────────
  const handleResetPassword = async () => {
    setResetError('');
    if (newPass.length < 6) {
      setResetError('Password must be at least 6 characters.');
      return;
    }
    if (newPass !== confirmNewPass) {
      setResetError('Passwords do not match.');
      return;
    }
    setResetLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, new_password: newPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Reset failed.');

      alert('Password updated successfully. Please sign in.');
      setShowResetModal(false);
      setEmail(forgotEmail);
    } catch (e) {
      setResetError(e.message || 'Could not reset password.');
    } finally {
      setResetLoading(false);
    }
  };

  // ---- Google login (unchanged) ----
  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const token = credentialResponse.credential;
      const res = await fetch(`${API_BASE}/auth/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data?.email) localStorage.setItem('user_email', data.email);
        if (data?.first_name)
          localStorage.setItem('user_first', data.first_name);
        navigate('/upload');
      } else {
        alert(data.detail || 'Google login failed.');
      }
    } catch {
      alert('Google login error.');
    }
  };

  return (
    <div className="page-root">
      {/* Animated background */}
      <div className="bg-animated" aria-hidden />

      {/* TOP FOLD */}
      <div className="login-wrapper">
        <header className="site-header slide-in-top">
          <Logo3D />
          Automated Domain Expert Chatbot
        </header>

        <div className="login-container">
          {/* ── HERO LAYOUT ── */}
          <div className="hero-layout">
            {/* Left side: tagline + small copy */}
            <div className="hero-copy fade-in-left">
              <p className="hero-kicker">AI-powered, context-grounded chat</p>
              <h1 className="hero-tagline">
                Your knowledge.
                <br />
                Your chatbot.
                <br />
                <span className="hero-tagline-highlight">Zero effort.</span>
              </h1>
              <p className="hero-sub">
                Upload your files or paste a website link. We turn your content
                into a domain expert you can chat with in seconds.
              </p>
              <div className="hero-pills">
                <span className="hero-pill">📂 Files + URLs together</span>
                <span className="hero-pill">🔐 Data stays private</span>
                <span className="hero-pill">⚡ RAG + Gemini answers</span>
              </div>
            </div>

            {/* Right side: login card */}
            <div className="login-card scale-in-center">
              <h2 className="title">Welcome back</h2>

              <div className="stack">
                <input
                  type="email"
                  className="input"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />

                <button
                  className="btn-primary btn-48"
                  onClick={handleContinue}
                  disabled={loading}
                >
                  {loading ? 'Checking…' : 'Continue'}
                </button>

                <div className="row between small">
                  <span className="muted">
                    Don’t have an account? <Link to="/signup">Sign up</Link>
                  </span>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={openForgotModal}
                  >
                    Forgot password?
                  </button>
                </div>

                <div className="divider">
                  <span>OR</span>
                </div>

                <div className="google-row">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => alert('Google Sign-In failed')}
                  />
                </div>

                <div className="footer-links">
                  <a href="/">Terms of Use</a> <span>•</span>{' '}
                  <a href="/">Privacy Policy</a>
                </div>
              </div>
            </div>
          </div>

          {/* centered scroll cue */}
          <a
            href="#how-it-works"
            className="scroll-cue"
            aria-label="Scroll to How it works"
          >
            <span className="cue-dot" /> How it works{' '}
            <span className="cue-arrow">↓</span>
          </a>
        </div>
      </div>

      {/* HOW IT WORKS (unchanged) */}
      <section id="how-it-works" className="how-section" tabIndex="-1">
        <div className="how-inner">
          <div className="how-header">
            <h2>How it works</h2>
            <p className="how-sub">
              Upload documents or websites, we index them smartly, and every
              answer is grounded in your content.
            </p>
            <div className="section-divider" />
          </div>

          <div className="how-grid">
            <div className="how-step">
              <div className="step-badge">1</div>
              <h3>Upload files & links</h3>
              <ul className="how-bullets">
                <li>PDF, Word, PowerPoint, Excel, CSV, and TXT supported</li>
                <li>Paste a URL to scrape key pages</li>
                <li>Secure local processing</li>
              </ul>
            </div>

            <div className="how-step">
              <div className="step-badge">2</div>
              <h3>Smart indexing</h3>
              <ul className="how-bullets">
                <li>Structure preserved (titles, bullets, tables)</li>
                <li>Clean + chunk text with overlap</li>
                <li>Semantic embeddings stored</li>
              </ul>
            </div>

            <div className="how-step">
              <div className="step-badge">3</div>
              <h3>Ask anything</h3>
              <ul className="how-bullets">
                <li>Top-K retrieval finds relevant context</li>
                <li>Optional image & voice input</li>
                <li>Fast, precise answers</li>
              </ul>
            </div>

            <div className="how-step">
              <div className="step-badge">4</div>
              <h3>Grounded answers</h3>
              <ul className="how-bullets">
                <li>Strict “answer only from context” prompting</li>
                <li>Low hallucinations, high trust</li>
                <li>Source-aware responses</li>
              </ul>
            </div>
          </div>

          <div className="benefits-wrap">
            <div className="benefit-chip">⏱ Save hours of reading</div>
            <div className="benefit-chip">🔐 Your data stays private</div>
            <div className="benefit-chip">🧭 Clear, cited answers</div>
          </div>

          <a href="#" className="back-to-top">
            Back to top ↑
          </a>
        </div>
      </section>

      {/* ===== Modal: Enter Email ===== */}
      {showEmailModal && (
        <div className="modal-overlay fade-in">
          <div className="modal-card scale-in-center">
            <h3>Reset your password</h3>
            <p className="muted">Enter your registered email.</p>
            <input
              type="email"
              className="input"
              placeholder="Email address"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
            />
            {emailError && <p className="error">{emailError}</p>}
            <div className="modal-actions">
              <button
                className="btn-secondary btn-44"
                onClick={() => setShowEmailModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary btn-44"
                onClick={handleForgotEmailSubmit}
                disabled={checkingEmail}
              >
                {checkingEmail ? 'Checking…' : 'Send Code'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: Enter 4-digit code ===== */}
      {showCodeModal && (
        <div className="modal-overlay fade-in">
          <div className="modal-card scale-in-center">
            <h3>Enter verification code</h3>
            <p className="muted">
              We&apos;ve sent a 4-digit reset code to{' '}
              <strong>{forgotEmail}</strong>.
            </p>
            <input
              type="text"
              maxLength={4}
              className="input"
              placeholder="4-digit code"
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value)}
            />
            {codeError && <p className="error">{codeError}</p>}
            <div className="modal-actions">
              <button
                className="btn-secondary btn-44"
                onClick={() => setShowCodeModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary btn-44"
                onClick={handleVerifyCode}
                disabled={codeLoading}
              >
                {codeLoading ? 'Verifying…' : 'Verify Code'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: New Password ===== */}
      {showResetModal && (
        <div className="modal-overlay fade-in">
          <div className="modal-card scale-in-center">
            <h3>Create a new password</h3>
            <p className="muted">
              for <strong>{forgotEmail}</strong>
            </p>
            <input
              type="password"
              className="input"
              placeholder="New password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
            />
            <input
              type="password"
              className="input"
              placeholder="Confirm new password"
              value={confirmNewPass}
              onChange={(e) => setConfirmNewPass(e.target.value)}
            />
            {resetError && <p className="error">{resetError}</p>}
            <div className="modal-actions">
              <button
                className="btn-secondary btn-44"
                onClick={() => setShowResetModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary btn-44"
                onClick={handleResetPassword}
                disabled={resetLoading}
              >
                {resetLoading ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: Email not registered (for main login Continue) ===== */}
      {showUnregModal && (
        <div className="modal-overlay fade-in">
          <div className="modal-card scale-in-center">
            <h3>Email not registered</h3>
            <p className="muted">
              We couldn&apos;t find an account with{' '}
              <strong>{email}</strong>. Please sign up first.
            </p>
            <div className="modal-actions">
              <button
                className="btn-secondary btn-44"
                onClick={() => setShowUnregModal(false)}
              >
                Close
              </button>
              <button
                className="btn-primary btn-44"
                onClick={() => {
                  setShowUnregModal(false);
                  navigate('/signup');
                }}
              >
                Go to Sign up
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
