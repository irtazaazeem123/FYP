import React from "react";
import "./AboutUs.css";

const team = [
  {
    name: "Muhammad Irtaza Azeem",
    role: "Backend & Infrastructure",
    initials: "MI",
    blurb:
      "Leads the backend, database design, and deployment, ensuring the system is fast, stable, and scalable.",
  },
  {
    name: "Muhammad Shaheer Ahmad Chishty",
    role: "AI & RAG Pipeline",
    initials: "SC",
    blurb:
      "Focuses on deep learning, embeddings, and retrieval-augmented generation so every answer stays grounded in your data.",
  },
  {
    name: "Ahmer Aftab",
    role: "Frontend & Experience",
    initials: "AA",
    blurb:
      "Designs the user journey and interface, making the chatbot feel clean, intuitive, and visually consistent.",
  },
];

const AboutUs = () => {
  return (
    <div className="about-wrapper">
      {/* Animated background */}
      <div className="about-bg" />

      <div className="about-container fade-in">
        <h1 className="about-title">About Us</h1>
        <p className="about-subtitle">
          The team behind <span>Automated Domain Expert Chatbot</span>
        </p>

        <div className="about-divider-glow" />

        <p className="about-text">
          We are a team of three final-year students from
          <span className="highlight"> Bahria University Karachi Campus</span> —
          <strong> Muhammad Irtaza Azeem</strong>,{" "}
          <strong>Muhammad Shaheer Ahmad Chishty</strong>, and{" "}
          <strong>Ahmer Aftab</strong> — driven by the shared ambition to build
          meaningful, intelligent systems.
        </p>

        <p className="about-text">
          Our Final Year Project,{" "}
          <strong>Automated Domain Expert Chatbot</strong>, merges modern web
          technologies, deep learning, and retrieval-augmented generation to
          create a smart assistant capable of understanding documents, scraping
          websites, and delivering grounded, context-aware answers with
          precision.
        </p>

        <p className="about-text">
          Our goal is simple: to make knowledge{" "}
          <strong>accessible, searchable, and interactive</strong> through a
          fast, powerful, and beautifully designed AI platform — a tool that
          helps students, professionals, and organizations get instant expert
          support from their own data.
        </p>

        {/* Neon separator */}
        <div className="about-divider-glow about-divider-spacing" />

        {/* Team cards */}
        <section className="team-section">
          {team.map((member, idx) => (
            <article key={member.name} className="team-card float-card">
              <div className="avatar-ring">
                <div className="avatar-bubble">
                  <span>{member.initials}</span>
                </div>
              </div>
              <h3 className="member-name">{member.name}</h3>
              <p className="member-role">{member.role}</p>
              <p className="member-blurb">{member.blurb}</p>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
};

export default AboutUs;
