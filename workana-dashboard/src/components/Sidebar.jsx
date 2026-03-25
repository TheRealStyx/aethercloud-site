import React from "react";

export default function Sidebar({ paginaAtiva, setPagina }) {
  const itens = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "oportunidades", label: "Oportunidades", icon: "explore" },
    { id: "meus_projetos", label: "Meus Projetos", icon: "folder_open" },
  ];

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        The Curated
        <br />
        Exchange
      </div>

      <nav className="sidebar-nav">
        <p className="nav-label">Menu</p>
        {itens.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${paginaAtiva === item.id ? "active" : ""}`}
            onClick={() => setPagina(item.id)}
          >
            <span className="material-symbols-outlined nav-icon">
              {item.icon}
            </span>
            <span className="nav-text">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Perfil */}
      <div className="sidebar-profile">
        <img
          className="profile-avatar"
          src="https://ui-avatars.com/api/?name=Pedro&background=3b82f6&color=fff"
          alt="avatar"
        />
        <div className="profile-info">
          <p className="profile-name">Pedro</p>
          <p className="profile-role">Senior Programmer</p>
        </div>
        <span className="material-symbols-outlined profile-more">
          more_vert
        </span>
      </div>
    </aside>
  );
}
