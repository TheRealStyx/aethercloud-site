import React, { useState, useEffect, useCallback } from "react";

const API_URL = "http://127.0.0.1:5002";
const HEADERS = { Authorization: "Bearer workanabot-dev-token" };

const STATUS_LABELS = {
  em_elaboracao: "Em Elaboração",
  proposta_pronta: "Proposta Pronta",
  enviada: "Enviada",
  ganho: "Ganho",
  perdido: "Perdido",
};

const STATUS_CLASS = {
  em_elaboracao: "mp-status--elaboracao",
  proposta_pronta: "mp-status--pronta",
  enviada: "mp-status--enviada",
  ganho: "mp-status--ganho",
  perdido: "mp-status--perdido",
};

function dataRelativa(timestamp) {
  if (!timestamp) return "";
  const diff = Math.floor(Date.now() / 1000) - timestamp;
  if (diff < 60) return "agora mesmo";
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d atrás`;
  return new Date(timestamp * 1000).toLocaleDateString("pt-BR");
}

export default function MeusProjetosPage({ onAbrirProjeto }) {
  const [projetos, setProjetos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [removendo, setRemovendo] = useState(null);

  const buscarProjetos = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch(`${API_URL}/api/projetos-salvos`, { headers: HEADERS });
      const data = await res.json();
      setProjetos(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erro ao buscar projetos salvos:", err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    buscarProjetos();
  }, [buscarProjetos]);

  const removerProjeto = async (projeto) => {
    if (!window.confirm(`Remover "${projeto.oportunidade?.titulo}"?`)) return;
    setRemovendo(projeto.id);
    try {
      await fetch(`${API_URL}/api/projetos-salvos/${projeto.id}`, {
        method: "DELETE",
        headers: HEADERS,
      });
      setProjetos((prev) => prev.filter((p) => p.id !== projeto.id));
    } catch (err) {
      console.error("Erro ao remover projeto:", err);
    } finally {
      setRemovendo(null);
    }
  };

  if (carregando) {
    return (
      <div className="meus-projetos-page">
        <div className="mp-header">
          <h1 className="mp-title">Meus Projetos</h1>
        </div>
        <div className="op-empty">
          <span className="material-symbols-outlined op-empty-icon animate-spin">sync</span>
          <p className="op-empty-title">Carregando projetos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="meus-projetos-page">
      <div className="mp-header">
        <div>
          <h1 className="mp-title">Meus Projetos</h1>
          <p className="mp-subtitle">
            {projetos.length === 0
              ? "Nenhum projeto salvo ainda"
              : `${projetos.length} projeto${projetos.length !== 1 ? "s" : ""} salvo${projetos.length !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      {projetos.length === 0 ? (
        <div className="op-empty">
          <span className="material-symbols-outlined op-empty-icon">folder_open</span>
          <p className="op-empty-title">Nenhum projeto salvo</p>
          <p className="op-empty-desc">
            Vá em Oportunidades e clique em "Salvar em Meus Projetos" para começar a trabalhar em uma proposta.
          </p>
        </div>
      ) : (
        <div className="mp-grid">
          {projetos.map((projeto) => {
            const op = projeto.oportunidade || {};
            const status = projeto.status || "em_elaboracao";
            return (
              <div key={projeto.id} className="mp-card card">
                <div className="mp-card-header">
                  <h3 className="mp-card-titulo">{op.titulo || "Sem título"}</h3>
                  <span className={`mp-status ${STATUS_CLASS[status] || ""}`}>
                    {STATUS_LABELS[status] || status}
                  </span>
                </div>

                <div className="mp-card-meta">
                  {op.valor && (
                    <span className="mp-card-valor">{op.valor}</span>
                  )}
                  <span className="mp-card-data">
                    Salvo {dataRelativa(projeto.criado_em)}
                  </span>
                </div>

                {op.skills?.length > 0 && (
                  <div className="mp-card-tags">
                    {op.skills.slice(0, 4).map((s, i) => (
                      <span key={i} className="op-tag">{s}</span>
                    ))}
                  </div>
                )}

                {projeto.proposta_texto && (
                  <p className="mp-card-preview">
                    {projeto.proposta_texto.slice(0, 120)}
                    {projeto.proposta_texto.length > 120 ? "..." : ""}
                  </p>
                )}

                <div className="mp-actions">
                  <button
                    className="btn-sync"
                    onClick={() => onAbrirProjeto(projeto)}
                  >
                    Abrir Workspace
                  </button>
                  <button
                    className="btn-remover"
                    onClick={() => removerProjeto(projeto)}
                    disabled={removendo === projeto.id}
                  >
                    {removendo === projeto.id ? "Removendo..." : "Remover"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
