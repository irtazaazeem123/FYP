// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';

import LoginPage from './components/Auth/LoginPage';
import SignupPage from './components/Auth/SignupPage';
import PasswordPage from './components/Auth/PasswordPage';
import DataUploadPage from './components/Auth/DataUploadPage';
import ChatbotPage from './components/Auth/ChatbotPage';
import AboutUs from './components/Info/AboutUs';

// 👉 put your real client ID here
const GOOGLE_CLIENT_ID = "602271292166-j6d8ag5pbd2bo4ld0jfg92fctg0d9c5i.apps.googleusercontent.com";

const App = () => {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <Router>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/password" element={<PasswordPage />} />
          <Route path="/upload" element={<DataUploadPage />} />
          <Route path="/chatbot" element={<ChatbotPage />} />
          <Route path="/about-us" element={<AboutUs />} />
        </Routes>
      </Router>
    </GoogleOAuthProvider>
  );
};

export default App;
