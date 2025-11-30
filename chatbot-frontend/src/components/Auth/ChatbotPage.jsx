import React, { useEffect, useRef, useState } from 'react';
import './ChatbotPage.css';
import Logo3D from '../Three/Logo3D';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://127.0.0.1:8000';

export default function ChatbotPage() {
  const navigate = useNavigate();

  // ── User identity ─────────────────────────────────────────
  const userEmail = localStorage.getItem('user_email') || '';
  const userFirst =
    localStorage.getItem('user_first') ||
    (userEmail.split('@')[0] || 'User');
  const initialLetter = (userFirst[0] || 'U').toUpperCase();
  const authProvider = localStorage.getItem('auth_provider') || 'email';

  // ── Sidebar: datasets → chats ─────────────────────────────
  const [datasets, setDatasets] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [activeDataset, setActiveDataset] = useState('');
  const [activeChat, setActiveChat] = useState('');
  const [chatsMap, setChatsMap] = useState({});

  // Menus / confirmations
  const [dsMenuFor, setDsMenuFor] = useState(null);
  const [chatMenuFor, setChatMenuFor] = useState(null);
  const [confirmDeleteDs, setConfirmDeleteDs] = useState(null);
  const [confirmDeleteChat, setConfirmDeleteChat] = useState(null);

  // ── Chat area ─────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [awaiting, setAwaiting] = useState(false);
  const listEndRef = useRef(null);

  // Menus / modal
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNewChatMenu, setShowNewChatMenu] = useState(false);

  // Generate-one-key modal (for current dataset/chat)
  const [showApiModal, setShowApiModal] = useState(false);
  const [apiText, setApiText] = useState('');

  // API Wallet (list + copy/delete) modal
  const [showKeysModal, setShowKeysModal] = useState(false);
  const [keysLoading, setKeysLoading] = useState(false);
  const [apiKeys, setApiKeys] = useState([]);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
  const [copiedKeyId, setCopiedKeyId] = useState(null);

  // Voice
  const [isRecording, setIsRecording] = useState(false);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // NEW: Image upload
  const imgInputRef = useRef(null);

  // Sidebar resize
  const draggingRef = useRef(false);
  const [sidebarW, setSidebarW] = useState(() => {
    const saved = Number(localStorage.getItem('cbt_sidebar_w') || 260);
    return Math.max(220, Math.min(560, saved));
  });

  // DELETE ACCOUNT modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // NEW: ACCOUNT DELETED confirmation modal
  const [showDeletedModal, setShowDeletedModal] = useState(false);

  // CHANGE PASSWORD modal
  const [showChangePwdModal, setShowChangePwdModal] = useState(false);
  const [pwdStep, setPwdStep] = useState('current');
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdSuccess, setPwdSuccess] = useState('');

  // ── API helpers ───────────────────────────────────────────
  const fetchDatasets = async () => {
    const r = await fetch(
      `${API_BASE}/datasets?user_email=${encodeURIComponent(userEmail)}`
    );
    const d = await r.json();
    setDatasets(d.datasets || []);
  };

  const fetchChatsFor = async (datasetId) => {
    const r = await fetch(
      `${API_BASE}/chats?user_email=${encodeURIComponent(
        userEmail
      )}&dataset_id=${datasetId}`
    );
    const d = await r.json();
    setChatsMap((m) => ({ ...m, [datasetId]: d.chats || [] }));
  };

  const fetchMessages = async (chatId) => {
    const r = await fetch(
      `${API_BASE}/chats/${chatId}/messages?user_email=${encodeURIComponent(
        userEmail
      )}`
    );
    const d = await r.json();
    setMessages(d.messages || []);
  };

  const createChatSameFile = async () => {
    if (!activeDataset) return alert('Select a file first.');
    const r = await fetch(
      `${API_BASE}/chats?user_email=${encodeURIComponent(
        userEmail
      )}&dataset_id=${activeDataset}`,
      { method: 'POST' }
    );
    const d = await r.json();
    if (!r.ok) return alert(d.detail || 'Could not create chat');
    await fetchChatsFor(activeDataset);
    setActiveChat(d.chat_id);
    setMessages([]);
  };

  const handleAddData = async (file) => {
    if (!file || !activeDataset) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('user_email', userEmail);
    fd.append('dataset_id', activeDataset);
    const r = await fetch(`${API_BASE}/ingest/add`, {
      method: 'POST',
      body: fd,
    });
    const d = await r.json();
    alert(
      r.ok
        ? `Added ${d.added_chunks} chunks to this dataset.`
        : d.detail || 'Add data failed'
    );
  };

  const ask = async (question) => {
    const r = await fetch(`${API_BASE}/chat/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email: userEmail, chat_id: activeChat, question }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || 'Error');
    return d.answer;
  };

  const renameChat = async (chatId, newTitle) => {
    try {
      await fetch(
        `${API_BASE}/chats/${chatId}/title?user_email=${encodeURIComponent(
          userEmail
        )}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_title: newTitle }),
        }
      );
      setChatsMap((m) => {
        const copy = { ...m };
        for (const dsId of Object.keys(copy)) {
          copy[dsId] = (copy[dsId] || []).map((c) =>
            c.id === chatId ? { ...c, title: newTitle } : c
          );
        }
        return copy;
      });
    } catch {}
  };

  const deleteDataset = async (datasetId) => {
    const r = await fetch(
      `${API_BASE}/datasets/${datasetId}?user_email=${encodeURIComponent(
        userEmail
      )}`,
      { method: 'DELETE' }
    );
    const d = await r.json();
    if (!r.ok) return alert(d.detail || 'Delete failed');

    setDatasets((xs) => xs.filter((x) => x.id !== datasetId));
    setChatsMap((m) => {
      const n = { ...m };
      delete n[datasetId];
      return n;
    });
    setExpanded((e) => {
      const n = { ...e };
      delete n[datasetId];
      return n;
    });

    if (activeDataset === datasetId) {
      setActiveDataset('');
      setActiveChat('');
      setMessages([]);
    }
  };

  const deleteChat = async (dsId, chatId) => {
    const r = await fetch(
      `${API_BASE}/chats/${chatId}?user_email=${encodeURIComponent(
        userEmail
      )}`,
      { method: 'DELETE' }
    );
    const d = await r.json();
    if (!r.ok) return alert(d.detail || 'Delete chat failed');

    setChatsMap((m) => {
      const list = m[dsId] || [];
      return { ...m, [dsId]: list.filter((c) => c.id !== chatId) };
    });

    if (activeChat === chatId) {
      const remaining = (chatsMap[dsId] || []).filter((c) => c.id !== chatId);
      if (remaining.length) setActiveChat(remaining[0].id);
      else {
        setActiveChat('');
        setMessages([]);
      }
    }
  };

  // ── Effects ───────────────────────────────────────────────
  useEffect(() => {
    fetchDatasets();
  }, []);

  useEffect(() => {
    if (activeDataset && !chatsMap[activeDataset]) fetchChatsFor(activeDataset);
  }, [activeDataset]);

  useEffect(() => {
    if (activeChat) fetchMessages(activeChat);
  }, [activeChat]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, awaiting]);

  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return;
      const x = Math.max(220, Math.min(560, e.clientX));
      setSidebarW(x);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      localStorage.setItem('cbt_sidebar_w', String(sidebarW));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [sidebarW]);

  // ── Generate API KEY for current dataset/chat ─────────────
  const generateApiForCurrent = async () => {
    if (!activeDataset) {
      alert('Select a file first.');
      return;
    }
    const res = await fetch(`${API_BASE}/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_email: userEmail,
        dataset_id: activeDataset,
        chat_id: activeChat || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.detail || 'Could not create API key');
      return;
    }
    const token = data.api_key;
    setApiText(token);
    setShowApiModal(true);
  };

  // ── API Wallet (list) ─────────────────────────────────────
  const openKeysModal = async () => {
    setKeysLoading(true);
    setShowKeysModal(true);
    try {
      const r = await fetch(
        `${API_BASE}/api-keys?user_email=${encodeURIComponent(userEmail)}`
      );
      const d = await r.json();
      setApiKeys(d.api_keys || []);
    } catch {
      setApiKeys([]);
    } finally {
      setKeysLoading(false);
    }
  };

  const refreshKeys = async () => {
    try {
      const r = await fetch(
        `${API_BASE}/api-keys?user_email=${encodeURIComponent(userEmail)}`
      );
      const d = await r.json();
      setApiKeys(d.api_keys || []);
    } catch {
      setApiKeys([]);
    }
  };

  const deleteKey = async (keyId) => {
    try {
      const r = await fetch(
        `${API_BASE}/api-keys/${keyId}?user_email=${encodeURIComponent(
          userEmail
        )}`,
        { method: 'DELETE' }
      );
      const d = await r.json();
      if (!r.ok) return alert(d.detail || 'Delete failed');
      await refreshKeys();
    } catch {
      alert('Delete failed');
    }
  };

  const copyExistingKey = async (row) => {
    try {
      const r = await fetch(`${API_BASE}/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: userEmail,
          dataset_id: row.dataset_id,
          chat_id: row.chat_id || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) return alert(d.detail || 'Could not create API key');
      await navigator.clipboard.writeText(d.api_key);
      setCopiedKeyId(row.id);
      setTimeout(() => setCopiedKeyId(null), 1500);
      await refreshKeys();
    } catch {
      alert('Could not create/copy API key');
    }
  };

  // ── Voice ─────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data?.size) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        try {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const fd = new FormData();
          fd.append('file', blob, 'audio.webm');
          const res = await fetch(`${API_BASE}/voice/transcribe`, {
            method: 'POST',
            body: fd,
          });
          const data = await res.json();
          if (res.ok) setInput(data.text || '');
        } finally {
          stream.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
      };
      recorder.start();
      setIsRecording(true);
    } catch {
      alert('Microphone permission denied or not available.');
    }
  };
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // ── Image Upload ──────────────────────────────────────────
  const onPickImage = () => {
    if (!activeChat) return;
    imgInputRef.current?.click();
  };

  const handleImageSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat) return;

    e.target.value = '';

    setAwaiting(true);
    setMessages((m) => [...m, { role: 'user', text: '[Image sent]' }]);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('user_email', userEmail);
      fd.append('chat_id', activeChat);

      const res = await fetch(`${API_BASE}/chat/ask-image`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Image query failed');

      setMessages((m) => [
        ...m,
        { role: 'assistant', text: data.answer || '(No answer returned)' },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: 'Sorry — image processing failed.' },
      ]);
    } finally {
      setAwaiting(false);
    }
  };

  // ── Ask ───────────────────────────────────────────────────
  const sendQuestion = async () => {
    const q = input.trim();
    if (!q || !activeChat) return;
    setInput('');
    setAwaiting(true);
    setMessages((m) => [...m, { role: 'user', text: q }]);
    try {
      const answer = await ask(q);
      setMessages((m) => [...m, { role: 'assistant', text: answer }]);

      const list = chatsMap[activeDataset] || [];
      const meta = list.find((c) => c.id === activeChat);
      if (meta && /^(chat|new chat)\s*\d*$/i.test(meta.title || '')) {
        const short = q.length > 48 ? `${q.slice(0, 48)}…` : q;
        if (short) renameChat(activeChat, short);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: 'Sorry — something went wrong.' },
      ]);
    } finally {
      setAwaiting(false);
    }
  };

  const onLogout = () => {
    localStorage.clear();
    window.location.href = '/';
  };

  // ─────────────────────────────────────
  // DELETE ACCOUNT
  // ─────────────────────────────────────
  const openDeleteModal = () => {
    setDeleteText('');
    setDeleteError('');
    setShowDeleteModal(true);
    setShowUserMenu(false);
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

      localStorage.removeItem('user_email');
      localStorage.removeItem('user_first');
      localStorage.removeItem('last_ds_id');
      localStorage.removeItem('last_chat_id');
      localStorage.removeItem('auth_provider');

      setShowDeleteModal(false);
      setShowDeletedModal(true);
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
    setShowUserMenu(false);
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
        setPwdStep('new');
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

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="cbt-shell" style={{ gridTemplateColumns: `${sidebarW}px 1fr` }}>
      {/* Header */}
      <header className="cbt-header">
        <div className="cbt-brand">
          <Logo3D />
          <span className="cbt-title">Automated Domain Expert Chatbot</span>
        </div>

        <div className="cbt-user">
          <label className="cbt-action-btn" title="Add data to current file">
            Add Data
            <input
              type="file"
              accept=".pdf,.docx,.pptx,.csv,.xlsx,.txt"
              hidden
              onChange={(e) =>
                e.target.files?.[0] && handleAddData(e.target.files[0])
              }
            />
          </label>

          <button
            className="cbt-action-btn"
            onClick={openKeysModal}
            title="View & manage your API keys"
          >
            APIs
          </button>

          <div style={{ position: 'relative' }}>
            <button
              className="cbt-action-btn"
              onClick={() => setShowNewChatMenu((s) => !s)}
            >
              New Chat
            </button>
            {showNewChatMenu && (
              <div
                className="cbt-menu"
                style={{ right: 0 }}
                onMouseLeave={() => setShowNewChatMenu(false)}
              >
                <button
                  className="cbt-menu-item"
                  onClick={() => {
                    setShowNewChatMenu(false);
                    createChatSameFile();
                  }}
                >
                  With same file
                </button>
                <button
                  className="cbt-menu-item"
                  onClick={() => {
                    setShowNewChatMenu(false);
                    window.location.href = '/upload';
                  }}
                >
                  With different file (upload)
                </button>
              </div>
            )}
          </div>

          <button className="cbt-action-btn" onClick={generateApiForCurrent}>
            Generate API
          </button>

          <span className="cbt-hi">Hi, {userFirst}</span>
          <div
            className="cbt-avatar"
            onClick={() => setShowUserMenu((s) => !s)}
          >
            {initialLetter}
          </div>

          {showUserMenu && (
            <div
              className="cbt-menu"
              onMouseLeave={() => setShowUserMenu(false)}
            >
              <div className="cbt-menu-head">
                <div className="id">{userFirst}</div>
                <div className="sub">{userEmail}</div>
              </div>

              {authProvider !== 'google' && (
                <button
                  className="cbt-menu-item"
                  onClick={openChangePwdModal}
                >
                  Change Password
                </button>
              )}

              <button
                className="cbt-menu-item"
                style={{
                  color: '#fecaca',
                  borderColor: 'rgba(248,113,113,0.5)',
                }}
                onClick={openDeleteModal}
              >
                Delete Account
              </button>

              <button
                className="cbt-menu-item"
                onClick={() => navigate('/about-us')}
              >
                About Us
              </button>

              <button
                className="cbt-menu-item"
                onClick={onLogout}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Sidebar */}
      <aside className="cbt-sidebar" style={{ width: sidebarW }}>
        <div className="side-head">
          <input className="side-search" placeholder="Search…" />
        </div>

        <ul>
          {datasets.map((ds) => {
            const isOpen = !!expanded[ds.id];
            const isActive = activeDataset === ds.id;
            const chats = chatsMap[ds.id] || [];
            return (
              <li key={ds.id} className={`tree-ds ${isActive ? 'active' : ''}`}>
                <div
                  className="tree-row"
                  title={ds.name}
                  onClick={() => {
                    setActiveDataset(ds.id);
                    setExpanded((e) => {
                      const next = !e[ds.id];
                      if (next && !chatsMap[ds.id]) fetchChatsFor(ds.id);
                      return { ...e, [ds.id]: next };
                    });
                  }}
                >
                  <span className="car">{isOpen ? '▾' : '▸'}</span>
                  <span className="name">{ds.name}</span>

                  <button
                    className="row-dots"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDsMenuFor((v) => (v === ds.id ? null : ds.id));
                    }}
                    aria-label="More actions"
                    title="Options"
                  >
                    ⋯
                  </button>

                  {dsMenuFor === ds.id && (
                    <div
                      className="cbt-menu"
                      style={{ right: 0 }}
                      onMouseLeave={() => setDsMenuFor(null)}
                    >
                      <button
                        className="cbt-menu-item"
                        onClick={() => {
                          setDsMenuFor(null);
                          setConfirmDeleteDs(ds.id);
                        }}
                      >
                        Delete file…
                      </button>
                    </div>
                  )}
                </div>

                {isOpen && (
                  <ul className="tree-chats">
                    {chats.length === 0 && (
                      <li className="muted">No chats yet</li>
                    )}
                    {chats.map((ch) => (
                      <li
                        key={ch.id}
                        className={`tree-chat ${
                          activeChat === ch.id ? 'on' : ''
                        }`}
                      >
                        <div
                          className="chat-row"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDataset(ds.id);
                            setActiveChat(ch.id);
                          }}
                        >
                          <span className="chat-title" title={ch.title}>
                            {ch.title}
                          </span>
                          <div
                            className="chat-actions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              className="chat-more"
                              onClick={() =>
                                setChatMenuFor((v) =>
                                  v === ch.id ? null : ch.id
                                )
                              }
                              aria-label="Chat actions"
                              title="Options"
                            >
                              ⋯
                            </button>
                            {chatMenuFor === ch.id && (
                              <div
                                className="cbt-menu"
                                style={{ right: 0 }}
                                onMouseLeave={() => setChatMenuFor(null)}
                              >
                                <button
                                  className="cbt-menu-item"
                                  onClick={() => {
                                    setChatMenuFor(null);
                                    setConfirmDeleteChat({
                                      chatId: ch.id,
                                      dsId: ds.id,
                                    });
                                  }}
                                >
                                  Delete chat…
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        <div
          className="cbt-resize-handle"
          onMouseDown={() => {
            draggingRef.current = true;
          }}
          title="Drag to resize"
        />
      </aside>

      {/* Main chat */}
      <main className="cbt-main">
        <div className="cbt-messages">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`cbt-msg ${m.role === 'user' ? 'user' : 'bot'}`}
            >
              <div className="bubble">{m.text && <p>{m.text}</p>}</div>
            </div>
          ))}
          {awaiting && (
            <div className="cbt-msg bot">
              <div className="bubble typing">
                <span className="dot1"></span>
                <span className="dot2"></span>
                <span className="dot3"></span>
              </div>
            </div>
          )}
          <div ref={listEndRef} />
        </div>

        <div className="cbt-inputbar">
          <input
            type="text"
            placeholder={
              activeChat
                ? 'Ask something…'
                : 'Pick a chat or start a new one'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendQuestion()}
            disabled={!activeChat}
          />

          <button
            type="button"
            title="Send an image"
            className="pill"
            onClick={onPickImage}
            disabled={!activeChat}
          >
            📷
          </button>
          <input
            ref={imgInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            hidden
            onChange={handleImageSelected}
          />

          <button
            type="button"
            title={isRecording ? 'Recording… click to stop' : 'Record a voice query'}
            className={`pill ${isRecording ? 'listening' : ''}`}
            onClick={() =>
              isRecording ? stopRecording() : startRecording()
            }
            disabled={!activeChat}
          >
            {isRecording ? '⏺️' : '🎤'}
          </button>

          <button
            className="pill send"
            onClick={sendQuestion}
            disabled={awaiting || !activeChat}
          >
            ➤
          </button>
        </div>
      </main>

      {/* API KEY modal */}
      {showApiModal && (
        <div className="cbt-modal">
          <div className="cbt-modal-card">
            <h3>API Key</h3>
            <p className="muted small">
              Copy and keep this key secret. Use it as the{' '}
              <code>X-API-Key</code> header.
            </p>
            <div className="api-box">
              <code className="api-text">{apiText}</code>
            </div>
            <div className="api-actions">
              <button
                className="btn-primary"
                onClick={() => navigator.clipboard.writeText(apiText)}
              >
                Copy
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowApiModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Keys Modal */}
      {showKeysModal && (
        <div
          className="cbt-modal keys-modal"
          onClick={() => setShowKeysModal(false)}
        >
          <div
            className="cbt-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="keys-head">Your API Keys</h3>
            <p className="keys-sub">
              Copy or delete keys linked to your datasets/chats. Keep them
              secret.
            </p>

            {keysLoading ? (
              <div className="keys-empty">Loading…</div>
            ) : (apiKeys?.length ?? 0) === 0 ? (
              <div className="keys-empty">
                No API keys yet. Use “Generate API” to create one.
              </div>
            ) : (
              <div className="keys-table-wrap">
                <table className="keys-table">
                  <thead>
                    <tr>
                      <th style={{ width: '34%' }}>File</th>
                      <th style={{ width: '12%' }}>Scope</th>
                      <th style={{ width: '28%' }}>Key</th>
                      <th style={{ width: '18%' }}>Created</th>
                      <th style={{ width: '8%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map((row) => (
                      <tr key={row.id}>
                        <td title={row.dataset_name}>{row.dataset_name}</td>
                        <td className="muted small">
                          {row.chat_id ? 'Chat' : 'Dataset'}
                        </td>
                        <td className="mono">{row.masked}</td>
                        <td className="muted small">
                          {row.created_at
                            ? new Date(row.created_at).toLocaleString()
                            : '—'}
                        </td>
                        <td className="actions">
                          <button
                            className="btn-icon"
                            title="Copy key"
                            onClick={() => copyExistingKey(row)}
                          >
                            📋
                          </button>
                          {copiedKeyId === row.id && (
                            <span className="copied-tag">Copied</span>
                          )}
                          <button
                            className="btn-icon danger"
                            title="Delete key"
                            onClick={() => setConfirmDeleteKey(row)}
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="keys-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowKeysModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm for API key */}
      {confirmDeleteKey && (
        <div
          className="cbt-modal"
          onClick={() => setConfirmDeleteKey(null)}
        >
          <div
            className="cbt-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Delete this API key?</h3>
            <p className="muted small">This cannot be undone.</p>
            <div className="api-actions">
              <button
                className="btn-secondary"
                onClick={() => setConfirmDeleteKey(null)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={async () => {
                  const id = confirmDeleteKey.id;
                  setConfirmDeleteKey(null);
                  await deleteKey(id);
                }}
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete dataset confirms */}
      {confirmDeleteDs && (
        <div className="cbt-modal">
          <div className="cbt-modal-card">
            <h3>Delete this file?</h3>
            <p className="muted small">
              This will delete the dataset, all its chats and messages, and its
              embeddings.
            </p>
            <div className="api-actions">
              <button
                className="btn-secondary"
                onClick={() => setConfirmDeleteDs(null)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={async () => {
                  const id = confirmDeleteDs;
                  setConfirmDeleteDs(null);
                  await deleteDataset(id);
                }}
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteChat && (
        <div className="cbt-modal">
          <div className="cbt-modal-card">
            <h3>Delete this chat?</h3>
            <p className="muted small">
              This will remove the chat and its messages permanently.
            </p>
            <div className="api-actions">
              <button
                className="btn-secondary"
                onClick={() => setConfirmDeleteChat(null)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={async () => {
                  const { chatId, dsId } = confirmDeleteChat;
                  setConfirmDeleteChat(null);
                  await deleteChat(dsId, chatId);
                }}
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHANGE PASSWORD MODAL */}
      {showChangePwdModal && (
        <div
          className="cbt-modal"
          onClick={() => setShowChangePwdModal(false)}
        >
          <div
            className="cbt-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Change Password</h3>

            {pwdStep === 'current' && (
              <>
                <p className="muted small">
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
                  <p className="muted small" style={{ color: 'salmon' }}>
                    {pwdError}
                  </p>
                )}

                <div className="api-actions">
                  <button
                    className="btn-secondary"
                    onClick={() => setShowChangePwdModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
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
                <p className="muted small">
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
                  <p className="muted small" style={{ color: 'salmon' }}>
                    {pwdError}
                  </p>
                )}
                {pwdSuccess && (
                  <p className="muted small" style={{ color: '#bbf7d0' }}>
                    {pwdSuccess}
                  </p>
                )}

                <div className="api-actions">
                  <button
                    className="btn-secondary"
                    onClick={() => setShowChangePwdModal(false)}
                  >
                    Close
                  </button>
                  <button
                    className="btn-primary"
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
          className="cbt-modal"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="cbt-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: '#fee2e2' }}>Delete your account?</h3>
            <p className="muted small">
              This will delete your account, datasets, chats, messages, and API
              keys. This action cannot be undone.
            </p>
            <p className="muted small">
              Type <strong>"permanently delete"</strong> to confirm.
            </p>

            <input
              className="cbt-input"
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder='Type "permanently delete"'
            />

            {deleteError && (
              <p className="muted small" style={{ color: 'salmon' }}>
                {deleteError}
              </p>
            )}

            <div className="api-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW: ACCOUNT DELETED CONFIRMATION MODAL */}
      {showDeletedModal && (
        <div
          className="cbt-modal"
          onClick={() => {
            setShowDeletedModal(false);
            window.location.href = '/';
          }}
        >
          <div
            className="cbt-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Account deleted</h3>
            <p className="muted small">
              Your account and all associated data have been permanently removed.
            </p>
            <div className="api-actions">
              <button
                className="btn-primary"
                onClick={() => {
                  setShowDeletedModal(false);
                  window.location.href = '/';
                }}
              >
                Back to Login
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
