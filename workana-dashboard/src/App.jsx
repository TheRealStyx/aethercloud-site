import React, { useState, useEffect, useCallback } from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";
import OportunidadesPage from "./pages/OportunidadesPage";
import DashboardPage from "./pages/DashboardPage";
import MeusProjetosPage from "./pages/MeusProjetosPage";
import ProjetoWorkspacePage from "./pages/ProjetoWorkspacePage";

const API_URL = "http://127.0.0.1:5002";
const HEADERS = { Authorization: "Bearer workanabot-dev-token" };

export default function App() {
  const [paginaAtiva, setPagina] = useState("oportunidades");
  const [sessao, setSessao] = useState({ ativa: false, verificando: true });
  const [projetoAtivo, setProjetoAtivo] = useState(null);

  // Verifica sessão uma única vez ao montar o App
  const verificarSessao = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/workana/sessao`, { headers: HEADERS });
      const data = await res.json();
      setSessao({ ativa: data.ativa, verificando: false });
    } catch {
      setSessao({ ativa: false, verificando: false });
    }
  }, []);

  useEffect(() => {
    verificarSessao();

    // Ouve sessão capturada — atualiza estado global
    window.electronAPI?.onSessaoCapturada?.((dados) => {
      if (dados.ok) setSessao({ ativa: true, verificando: false });
    });
  }, [verificarSessao]);

  // Ao trocar de página, limpa o projeto ativo
  const handleSetPagina = (pagina) => {
    setPagina(pagina);
    if (pagina !== "meus_projetos") setProjetoAtivo(null);
  };

  const paginas = {
    dashboard: <DashboardPage />,
    oportunidades: <OportunidadesPage sessao={sessao} setSessao={setSessao} />,
    meus_projetos: (
      <MeusProjetosPage onAbrirProjeto={(proj) => setProjetoAtivo(proj)} />
    ),
  };

  const renderConteudo = () => {
    if (paginaAtiva === "meus_projetos" && projetoAtivo !== null) {
      return (
        <ProjetoWorkspacePage
          projeto={projetoAtivo}
          onVoltar={() => setProjetoAtivo(null)}
        />
      );
    }
    return paginas[paginaAtiva] ?? paginas.oportunidades;
  };

  return (
    <div className="dashboard-container">
      <Sidebar paginaAtiva={paginaAtiva} setPagina={handleSetPagina} />
      <main className="content">{renderConteudo()}</main>
    </div>
  );
}
