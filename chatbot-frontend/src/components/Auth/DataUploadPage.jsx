// src/components/Auth/DataUploadPage.jsx
import React, { useState, useRef, useEffect } from 'react';
import './SignupPage.css';
import Logo3D from '../Three/Logo3D';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://127.0.0.1:8000';

const DataUploadPage = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [fileName, setFileName] = useState('');
  const [processing, setProcessing] = useState(false);

  // topbar user
  const [firstName, setFirstName] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  // modals
  const [showReadyModal, setShowReadyModal] = useState(false);
  const [showApiModal, setShowApiModal] = useState(false);
  const [apiKey, setApiKey] = useState('');

  // DELETE ACCOUNT modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // CHANGE PASSWORD modal state
  const [showChangePwdModal, setShowChangePwdModal] = useState(false);
  const [pwdStep, setPwdStep] = useState('current'); // "current" | "new"
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdSuccess, setPwdSuccess] = useState('');

  // URL + pages
  const [linkUrl, setLinkUrl] = useState('');
  const [scrapePages, setScrapePages] = useState('10'); // user-requested pages

  const userEmail = localStorage.getItem('user_email') || '';

  // derive first name for topbar
  useEffect(() => {
    let stored = localStorage.getItem('user_first');
    if (!stored) {
      const guess =
        (userEmail.split('@')[0] || '').split(/[._-]/)[0] || 'User';
      stored = guess.charAt(0).toUpperCase() + guess.slice(1);
      localStorage.setItem('user_first', stored);
    }
    setFirstName(stored);
  }, [userEmail]);

  const initial =
    (firstName && firstName[0]) || (userEmail && userEmail[0]) || 'U';

  // close menu on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      if (!e.target.closest('.su-user-area')) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const logout = () => {
    localStorage.removeItem('user_email');
    localStorage.removeItem('user_first');
    // also clear any last dataset / chat so we never reuse another user’s dataset
    localStorage.removeItem('last_ds_id');
    localStorage.removeItem('last_ds_owner');
    localStorage.removeItem('last_chat_id');
    setMenuOpen(false);
    navigate('/');
  };

  // ─────────────────────────────────────
  // DELETE ACCOUNT
  // ─────────────────────────────────────
  const openDeleteModal = () => {
    setDeleteText('');
    setDeleteError('');
    setShowDeleteModal(true);
    setMenuOpen(false);
  };

  const handleConfirmDelete = async () => {
    setDeleteError('');

    if (deleteText.trim().toLowerCase() !== 'permanently delete') {
      setDeleteError('Please type "permanently delete" to confirm.');
      return;
    }

    if (!userEmail) {
      setDeleteError('No user email found.');
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/delete-account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      });

      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.detail || 'Could not delete account.');
        setDeleting(false);
        return;
      }

      localStorage.clear();
      alert('Your account and all data have been deleted.');
      navigate('/');
    } catch {
      setDeleteError('Could not delete account.');
    } finally {
      setDeleting(false);
    }
  };

  // ─────────────────────────────────────
  // CHANGE PASSWORD
  // ─────────────────────────────────────
  const openChangePwdModal = () => {
    setPwdStep('current');
    setCurrentPwd('');
    setNewPwd('');
    setConfirmPwd('');
    setPwdError('');
    setPwdSuccess('');
    setShowChangePwdModal(true);
    setMenuOpen(false);
  };

  const handleVerifyCurrentPwd = async () => {
    if (!userEmail) {
      setPwdError('No user email found.');
      return;
    }
    if (!currentPwd) {
      setPwdError('Please enter your current password.');
      return;
    }

    setPwdLoading(true);
    setPwdError('');
    setPwdSuccess('');

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, password: currentPwd }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwdError(data.detail || 'Current password is incorrect.');
      } else {
        // current password is correct → move to "new password" step
        setPwdStep('new');
        setPwdError('');
      }
    } catch {
      setPwdError('Could not verify password. Please try again.');
    } finally {
      setPwdLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPwd || !confirmPwd) {
      setPwdError('Please fill in both password fields.');
      return;
    }
    if (newPwd.length < 6) {
      setPwdError('New password must be at least 6 characters.');
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError('New password and confirm password do not match.');
      return;
    }

    setPwdLoading(true);
    setPwdError('');
    setPwdSuccess('');

    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, new_password: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwdError(data.detail || 'Could not change password.');
      } else {
        setPwdSuccess('Password updated successfully.');
      }
    } catch {
      setPwdError('Could not change password. Please try again.');
    } finally {
      setPwdLoading(false);
    }
  };

  // ─────────────────────────────────────
  // File Upload
  // ─────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!userEmail) {
      alert('You must be logged in to upload.');
      return;
    }

    setFileName(file.name);
    setProcessing(true);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('user_email', userEmail);

      const res = await fetch(`${API_BASE}/ingest/upload`, {
        method: 'POST',
        body: fd,
      });

      const data = await res.json();

      if (res.ok) {
        // remember this dataset and who owns it
        localStorage.setItem('last_ds_id', data.dataset_id);
        localStorage.setItem('last_ds_owner', userEmail);
        localStorage.setItem('last_chat_id', data.chat_id);
      } else {
        alert(data.detail || 'Upload failed');
        setFileName('');
      }
    } catch {
      alert('Upload failed.');
      setFileName('');
    } finally {
      setProcessing(false);
    }
  };

  const computePagesRequested = () => {
    let n = parseInt(scrapePages || '10', 10);
    if (Number.isNaN(n)) n = 10;
    if (n < 1) n = 1;
    if (n > 60) n = 60;
    return n;
  };

  // ─────────────────────────────────────
  // PROCEED (file + URL / URL only / file only)
  // ─────────────────────────────────────
  const handleProceed = async () => {
    if (!userEmail) {
      alert('You must be logged in first.');
      return;
    }

    const link = (linkUrl || '').trim();
    const hasFile = !!fileName;

    const storedDs = localStorage.getItem('last_ds_id');
    const storedOwner = localStorage.getItem('last_ds_owner');

    // only reuse dataset if a file is selected AND it belongs to this logged-in user
    const ds =
      hasFile && storedDs && storedOwner === userEmail ? storedDs : null;

    if (!hasFile && !link) {
      alert('Upload a file or paste a URL first.');
      return;
    }

    // only matters when a URL is present
    let pagesRequested = link ? computePagesRequested() : 10;

    // reset modal / api key state
    setShowReadyModal(false);
    setApiKey('');
    setProcessing(true);

    try {
      let res;
      let data;

      if (link && ds) {
        // 🔵 Combined: add scraped pages into existing dataset
        res = await fetch(`${API_BASE}/ingest/scrape-add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_email: userEmail,
            dataset_id: ds,
            url: link,
            max_pages: pagesRequested,
          }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Scrape add failed.');
        // embeddings already exist, just show ready modal
        setShowReadyModal(true);
      } else if (link) {
        // 🟣 URL-only → new dataset + chat for THIS user (every website separate)
        res = await fetch(`${API_BASE}/ingest/scrape-create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_email: userEmail,
            url: link,
            max_pages: pagesRequested,
          }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Scrape create failed.');

        localStorage.setItem('last_ds_id', data.dataset_id);
        localStorage.setItem('last_ds_owner', userEmail);
        localStorage.setItem('last_chat_id', data.chat_id);
        setShowReadyModal(true);
      } else {
        // 🟢 File-only: embeddings already created during upload
        setShowReadyModal(true);
      }
    } catch (e) {
      alert(e.message || 'Failed.');
    } finally {
      setProcessing(false);
    }
  };

  // ─────────────────────────────────────
  // API KEY
  // ─────────────────────────────────────
  const handleGenerateApi = async () => {
    const ds = localStorage.getItem('last_ds_id');
    const chat = localStorage.getItem('last_chat_id') || null;

    if (!ds) return alert('No dataset found.');

    try {
      const res = await fetch(`${API_BASE}/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: userEmail,
          dataset_id: ds,
          chat_id: chat,
        }),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.detail || 'Could not create API key.');

      setApiKey(data.api_key);
      setShowApiModal(true);
    } catch {
      alert('Could not create API key.');
    }
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      alert('API key copied!');
    } catch {
      alert('Copy failed.');
    }
  };

  const goToChatbot = () => navigate('/chatbot');

  const topbarBtnStyle = {
    background: '#5361f8',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: '8px 12px',
    fontWeight: 700,
    boxShadow: '0 10px 22px rgba(83,97,248,.28)',
    cursor: 'pointer',
    marginRight: 10,
  };

  return (
    <div className="signup-wrapper">
      {/* Top bar */}
      <div className="su-topbar">
        <div className="su-topbar-inner">
          <div className="su-brand">
            <Logo3D />
            <span className="su-brand-name">
              Automated Domain Expert Chatbot
            </span>
          </div>

          <div className="su-user-area">
            <button
              style={topbarBtnStyle}
              onClick={goToChatbot}
              title="Open your existing chats"
            >
              Old Chats
            </button>

            <span className="su-greeting">Hi, {firstName || 'User'}</span>
            <button
              className="su-avatar"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              title="Account"
            >
              {initial.toUpperCase()}
            </button>

            {menuOpen && (
              <div className="su-menu" role="menu">
                <div className="su-menu-header">
                  <div className="su-menu-id">{firstName || 'User'}</div>
                  <div className="su-menu-sub">{userEmail}</div>
                </div>

                <button
                  className="su-menu-item"
                  onClick={openChangePwdModal}
                >
                  Change Password
                </button>

                <button
                  className="su-menu-item"
                  style={{
                    borderColor: 'rgba(248,113,113,0.5)',
                    color: '#fecaca',
                  }}
                  onClick={openDeleteModal}
                >
                  Delete Account
                </button>

                <button
                  className="su-menu-item"
                  onClick={() => navigate('/about-us')}
                >
                  About Us
                </button>

                <button
                  className="su-menu-item"
                  onClick={logout}
                  role="menuitem"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main upload hero + card */}
      <div className="upload-main">
        {/* LEFT: tagline + options */}
        <section className="upload-hero">
          <h1 className="upload-title">
            Build a{' '}
            <span className="upload-title-highlight">
              data-grounded chatbot.
            </span>
          </h1>
          <p className="upload-sub">
            Choose how you want to feed your bot: upload a data file, paste a
            website URL, or use both together. We&apos;ll index it all and get
            your chatbot ready.
          </p>

          <div className="upload-steps">
            <div className="upload-step-card">
              <div className="upload-step-badge">1</div>
              <div>
                <div className="upload-step-title">Option 1 — Data file only</div>
                <div className="upload-step-text">
                  Upload PDFs, Word docs, slides, spreadsheets, or text and we
                  build a chatbot just from that file.
                </div>
              </div>
            </div>

            <div className="upload-step-card">
              <div className="upload-step-badge">2</div>
              <div>
                <div className="upload-step-title">Option 2 — Website only</div>
                <div className="upload-step-text">
                  Paste a URL and we crawl those pages to create a chatbot from
                  your site content.
                </div>
              </div>
            </div>

            <div className="upload-step-card">
              <div className="upload-step-badge">3</div>
              <div>
                <div className="upload-step-title">
                  Option 3 — File + URL together
                </div>
                <div className="upload-step-text">
                  Upload a file and add a URL to merge both into one dataset so
                  a single chatbot sees everything.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT: upload card */}
        <section className="upload-card-wrap">
          <div className="signup-box" aria-labelledby="upload-title">
            <h2 id="upload-title" className="signup-title">
              Upload Your Dataset
            </h2>
            <p className="upload-card-sub">
              Upload a file, paste a URL, or combine both. Then click{' '}
              <strong>Proceed</strong> to prepare your chatbot.
            </p>

            {/* File picker */}
            <div style={{ marginBottom: 10 }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: 4,
                  color: '#cbd5e1',
                  fontSize: '.9rem',
                }}
              >
                Upload file
              </label>
              <input
                id="file-input"
                ref={fileInputRef}
                type="file"
                accept=".pdf,.csv,.txt,.docx,.pptx,.xlsx"
                onChange={handleFileUpload}
                className="signup-input"
              />
              {fileName && (
                <p
                  style={{
                    fontSize: '0.92rem',
                    color: '#cbd5e1',
                    margin: '6px 2px 0',
                  }}
                >
                  📄 <strong>{fileName}</strong>{' '}
                  {processing ? '(uploading…)' : '(uploaded)'}
                </p>
              )}
            </div>

            {/* URL input */}
            <div style={{ marginBottom: 10 }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: 4,
                  color: '#cbd5e1',
                  fontSize: '.9rem',
                }}
              >
                Paste URL
              </label>
              <input
                id="url-input"
                type="url"
                placeholder="https://example.com"
                className="signup-input"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
              />
            </div>

            {/* Pages to scrape */}
            <div style={{ marginBottom: 10 }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: 4,
                  color: '#cbd5e1',
                  fontSize: '.9rem',
                }}
              >
                Number of pages{' '}
                <span style={{ fontWeight: 500 }}>(should be below 60)</span>
              </label>
              <input
                type="number"
                min={1}
                max={60}
                className="signup-input"
                value={scrapePages}
                onChange={(e) => setScrapePages(e.target.value)}
                placeholder="Number of pages (should be below 60)"
              />
            </div>

            {/* Proceed */}
            <button
              onClick={handleProceed}
              className="register-btn"
              disabled={processing}
              aria-busy={processing}
            >
              {processing ? 'Processing…' : 'Proceed'}
            </button>

            <p className="upload-tip">
              Tip: For best performance, keep website crawls under{' '}
              <strong>60 pages</strong>.
            </p>
          </div>
        </section>
      </div>

      {/* Ready modal */}
      {showReadyModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowReadyModal(false)}
        >
          <div
            className="su-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(92vw, 560px)' }}
          >
            <h3 style={{ marginTop: 0, color: '#e7ebff' }}>
              Your chatbot is ready
            </h3>
            <p className="muted">
              You can go to chat or generate an API key.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 10,
                justifyContent: 'flex-end',
              }}
            >
              <button className="su-primary-btn" onClick={goToChatbot}>
                Go to Chatbot
              </button>
              <button className="su-primary-btn" onClick={handleGenerateApi}>
                Generate API
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowReadyModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API key modal */}
      {showApiModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowApiModal(false)}
        >
          <div
            className="su-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(92vw, 700px)' }}
          >
            <h3 style={{ marginTop: 0, color: '#e7ebff' }}>Your API Key</h3>
            <p className="muted">
              Copy and store it securely. Use the <code>X-API-Key</code>{' '}
              header.
            </p>
            <input
              readOnly
              className="su-input"
              value={apiKey}
              style={{
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              }}
            />
            <div
              style={{
                display: 'flex',
                gap: 10,
                justifyContent: 'flex-end',
              }}
            >
              <button
                className="btn-secondary"
                onClick={() => setShowApiModal(false)}
              >
                Close
              </button>
              <button className="su-primary-btn" onClick={copyKey}>
                Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHANGE PASSWORD MODAL */}
      {showChangePwdModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowChangePwdModal(false)}
        >
          <div
            className="su-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(92vw, 520px)' }}
          >
            <h3 style={{ marginTop: 0, color: '#e7ebff' }}>
              Change Password
            </h3>

            {pwdStep === 'current' && (
              <>
                <p className="muted">
                  Enter your current password to continue.
                </p>
                <input
                  className="su-input"
                  type="password"
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  placeholder="Current password"
                />
                {pwdError && (
                  <p style={{ color: 'salmon', marginTop: 4 }}>{pwdError}</p>
                )}

                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    justifyContent: 'flex-end',
                    marginTop: 10,
                  }}
                >
                  <button
                    className="btn-secondary"
                    onClick={() => setShowChangePwdModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="su-primary-btn"
                    disabled={pwdLoading}
                    onClick={handleVerifyCurrentPwd}
                  >
                    {pwdLoading ? 'Checking…' : 'Next'}
                  </button>
                </div>
              </>
            )}

            {pwdStep === 'new' && (
              <>
                <p className="muted">
                  Current password verified. Enter your new password below.
                </p>

                <input
                  className="su-input"
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="New password (min 6 characters)"
                />
                <input
                  className="su-input"
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="Confirm new password"
                />

                {pwdError && (
                  <p style={{ color: 'salmon', marginTop: 4 }}>{pwdError}</p>
                )}
                {pwdSuccess && (
                  <p style={{ color: '#bbf7d0', marginTop: 4 }}>
                    {pwdSuccess}
                  </p>
                )}

                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    justifyContent: 'flex-end',
                    marginTop: 10,
                  }}
                >
                  <button
                    className="btn-secondary"
                    onClick={() => setShowChangePwdModal(false)}
                  >
                    Close
                  </button>
                  <button
                    className="su-primary-btn"
                    disabled={pwdLoading}
                    onClick={handleChangePassword}
                  >
                    {pwdLoading ? 'Updating…' : 'Update password'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* DELETE ACCOUNT MODAL */}
      {showDeleteModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="su-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(92vw, 520px)' }}
          >
            <h3 style={{ marginTop: 0, color: '#fee2e2' }}>
              Permanently delete your account?
            </h3>
            <p className="muted">
              This will delete your account, datasets, chats, messages, and API
              keys. This action cannot be undone.
            </p>
            <p
              className="muted"
              style={{ marginTop: 8, marginBottom: 8, fontSize: '0.9rem' }}
            >
              To confirm, please type{' '}
              <strong style={{ color: '#fecaca' }}>"permanently delete"</strong>{' '}
              below.
            </p>

            <input
              className="su-input"
              type="text"
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder='Type "permanently delete" to confirm'
            />

            {deleteError && (
              <p style={{ color: 'salmon', marginTop: 4 }}>{deleteError}</p>
            )}

            <div
              style={{
                display: 'flex',
                gap: 10,
                justifyContent: 'flex-end',
                marginTop: 10,
              }}
            >
              <button
                className="btn-secondary"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                className="su-primary-btn"
                onClick={handleConfirmDelete}
                disabled={deleting}
                style={{ background: '#b91c1c' }}
              >
                {deleting ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SR-only live region */}
      <span className="visually-hidden" aria-live="polite">
        {processing ? 'Processing your data…' : ''}
      </span>
    </div>
  );
};

export default DataUploadPage;
