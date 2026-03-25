import React, { useState, useEffect, useCallback, useRef } from "react";

const API_URL = "http://127.0.0.1:5002";
const AUTH_TOKEN = "workanabot-dev-token";
const HEADERS = { Authorization: `Bearer ${AUTH_TOKEN}` };

// ── CARD ──────────────────────────────────────────────────────────────────────

const OpportunityCard = ({ op }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const descricao = op.descricao || "Sem descrição disponível.";
  const orcamento = op.orcamento || {};

  const salvarProjeto = async (e) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API_URL}/api/projetos-salvos`, {
        method: "POST",
        headers: { ...HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ oportunidade: op }),
      });
      if (res.ok || res.status === 409) {
        setSalvo(true);
        setTimeout(() => setSalvo(false), 2000);
      }
    } catch (err) {
      console.error("Erro ao salvar projeto:", err);
    }
  };

  // Formata o orçamento de forma mais detalhada
  const formatarOrcamento = () => {
    if (orcamento.valor) return orcamento.valor;
    if (orcamento.minimo && orcamento.maximo)
      return `USD ${orcamento.minimo} - ${orcamento.maximo}`;
    if (orcamento.minimo) return `A partir de USD ${orcamento.minimo}`;
    if (orcamento.maximo) return `Até USD ${orcamento.maximo}`;
    return op.valor || "A combinar";
  };

  return (
    <div
      className={`op-card card ${isExpanded ? "expandido" : ""}`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Linha principal */}
      <div className="op-card-main">
        <div className="op-card-left">
          <div className="op-card-header">
            <span className="op-card-valor">{formatarOrcamento()}</span>
            <span className="op-card-data">{op.publicado_em || "Recente"}</span>
          </div>
          <h3 className="op-card-titulo">{op.titulo}</h3>
        </div>

        <div className="op-card-right">
          <div className="op-card-tags">
            {op.skills?.length > 0 ? (
              op.skills.slice(0, 3).map((s, i) => (
                <span key={i} className="op-tag">
                  {s}
                </span>
              ))
            ) : (
              <span className="op-tag-empty">Geral</span>
            )}
          </div>
          <button
            className="btn-salvar-projeto"
            onClick={salvarProjeto}
          >
            {salvo ? "Salvo!" : "Salvar em Meus Projetos"}
          </button>
          <button
            className="btn-proposta"
            onClick={(e) => {
              e.stopPropagation();
              if (window.electronAPI?.abrirProjeto) {
                window.electronAPI.abrirProjeto(op.url);
              } else {
                window.open(op.url, "_blank");
              }
            }}
          >
            Gerar Proposta IA
          </button>
        </div>
      </div>

      {/* Descrição - SEMPRE VISÍVEL (cortada quando recolhido) */}
      <p className="op-card-desc">{descricao}</p>

      {/* INFORMAÇÕES COMPLETAS - SÓ APARECEM QUANDO EXPANDIDO */}
      {isExpanded && (
        <div className="op-card-detalhes">
          {/* Sobre este projeto */}
          {op.sobre_projeto && (
            <div className="detalhe-item">
              <span className="detalhe-label">Sobre este projeto:</span>
              <p className="detalhe-descricao">{op.sobre_projeto}</p>
            </div>
          )}

          {/* Descrição completa */}
          <div className="detalhe-item">
            <span className="detalhe-label">Descrição completa:</span>
            <p className="detalhe-descricao">{descricao}</p>
          </div>

          {/* Orçamento detalhado */}
          <div className="detalhe-item">
            <span className="detalhe-label">Orçamento:</span>
            <span className="detalhe-valor">{formatarOrcamento()}</span>
          </div>

          {/* Categoria */}
          {op.categoria && (
            <div className="detalhe-item">
              <span className="detalhe-label">Categoria:</span>
              <span className="detalhe-valor">{op.categoria}</span>
            </div>
          )}

          {/* Todas as habilidades */}
          {op.skills?.length > 0 && (
            <div className="detalhe-item">
              <span className="detalhe-label">Habilidades:</span>
              <div className="detalhe-tags">
                {op.skills.map((skill, i) => (
                  <span key={i} className="detalhe-tag">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Link do projeto */}
          {op.url && (
            <div className="detalhe-item">
              <span className="detalhe-label">Link:</span>
              <a
                href={op.url}
                target="_blank"
                rel="noopener noreferrer"
                className="detalhe-link"
                onClick={(e) => e.stopPropagation()}
              >
                {op.url}
              </a>
            </div>
          )}

          {/* Data de publicação detalhada */}
          {op.publicado_em && (
            <div className="detalhe-item">
              <span className="detalhe-label">Publicado:</span>
              <span className="detalhe-valor">{op.publicado_em}</span>
            </div>
          )}
        </div>
      )}

      {descricao.length > 150 && (
        <span
          className="op-card-expand-link"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
        >
          {isExpanded ? "Ver menos" : "Ver mais"}
        </span>
      )}
    </div>
  );
};

// ── PÁGINA ────────────────────────────────────────────────────────────────────

export default function OportunidadesPage({ sessao }) {
  const [oportunidades, setOportunidades] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [scraping, setScraping] = useState({
    emCurso: false,
    erro: null,
    ultimoSync: null,
  });

  // Ref estável para o intervalo — nunca recriada entre renders
  const pollingRef = useRef(null);
  // Ref para buscarOportunidades acessível dentro do intervalo sem stale closure
  const buscarRef = useRef(null);

  // ── Busca oportunidades ───────────────────────────────────────────────────
  const buscarOportunidades = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/oportunidades`);
      const data = await res.json();
      setOportunidades(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erro ao buscar oportunidades:", err);
    }
  }, []);

  // Mantém ref sempre atualizada
  buscarRef.current = buscarOportunidades;

  // ── Para o polling ────────────────────────────────────────────────────────
  const pararPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // ── Verifica status do scraping uma vez ───────────────────────────────────
  const checarStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/workana/scraping/status`, {
        headers: HEADERS,
      });
      const data = await res.json();

      const ultimoSync = data.ultimo_scraping
        ? new Date(data.ultimo_scraping * 1000).toLocaleTimeString("pt-BR")
        : null;

      setScraping({
        emCurso: data.em_curso,
        erro: data.erro || null,
        ultimoSync,
      });

      if (!data.em_curso) {
        pararPolling();
        buscarRef.current(); // atualiza cards quando terminar
      }
    } catch {
      pararPolling();
    }
  }, [pararPolling]);

  // ── Inicia polling a cada 3s ──────────────────────────────────────────────
  const iniciarPolling = useCallback(() => {
    pararPolling(); // garante que não há intervalo duplo
    pollingRef.current = setInterval(() => {
      checarStatus();
    }, 3000);
  }, [pararPolling, checarStatus]);

  // ── Sync manual ───────────────────────────────────────────────────────────
  const sincronizar = useCallback(async () => {
    setScraping((s) => ({ ...s, emCurso: true, erro: null }));

    try {
      if (window.electronAPI?.iniciarScraping) {
        await window.electronAPI.iniciarScraping();
      } else {
        await fetch(`${API_URL}/api/workana/scraping/iniciar`, {
          method: "POST",
          headers: HEADERS,
        });
      }
    } catch (err) {
      console.error("Erro ao iniciar scraping:", err);
    }

    iniciarPolling();
  }, [iniciarPolling]);

  // ── Conectar Workana ──────────────────────────────────────────────────────
  const conectarWorkana = useCallback(() => {
    window.electronAPI?.abrirLogin();
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    buscarOportunidades();
    checarStatus(); // checa uma vez — se estiver em curso já inicia o polling

    return () => pararPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Se detectar scraping em curso ao montar, inicia polling ──────────────
  useEffect(() => {
    if (scraping.emCurso && !pollingRef.current) {
      iniciarPolling();
    }
  }, [scraping.emCurso, iniciarPolling]);

  // ── Filtro local ──────────────────────────────────────────────────────────
  const exibidas = oportunidades.filter((op) => {
    if (!filtro) return true;
    const q = filtro.toLowerCase();
    return (
      op.titulo?.toLowerCase().includes(q) ||
      op.descricao?.toLowerCase().includes(q) ||
      op.skills?.some((s) => s.toLowerCase().includes(q))
    );
  });

  const sessaoClass = sessao.ativa ? "sessao-ativa" : "sessao-expirada";

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="op-page">
      <header className="op-header">
        <div className="op-search-wrap">
          <span className="material-symbols-outlined op-search-icon">
            search
          </span>
          <input
            className="op-search-input"
            placeholder="Filtrar por título, skill..."
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        </div>

        <div className="op-header-actions">
          <div className={`sessao-badge ${sessaoClass}`}>
            <span className="sessao-dot" />
            <span className="sessao-label">
              {sessao.verificando
                ? "CHECKING..."
                : sessao.ativa
                ? "WORKANA CONNECTED"
                : "SESSION EXPIRED"}
            </span>
          </div>

          {scraping.ultimoSync && !scraping.emCurso && (
            <span className="sync-info">Sync {scraping.ultimoSync}</span>
          )}

          {sessao.ativa ? (
            <button
              className={`btn-sync ${
                scraping.emCurso ? "btn-sync--loading" : ""
              }`}
              onClick={sincronizar}
              disabled={scraping.emCurso}
            >
              {scraping.emCurso ? (
                <>
                  <span className="animate-spin">↻</span> SYNCING...
                </>
              ) : (
                "SYNC NOW"
              )}
            </button>
          ) : (
            <button className="btn-sync" onClick={conectarWorkana}>
              Conectar Workana
            </button>
          )}
        </div>
      </header>

      <main className="op-main">
        {/* Aguardando login */}
        {!sessao.ativa && !sessao.verificando && (
          <div className="op-empty">
            <span className="material-symbols-outlined op-empty-icon">
              login
            </span>
            <p className="op-empty-title">Conecte sua conta Workana</p>
            <p className="op-empty-desc">
              Clique em "Conectar Workana" para fazer login e carregar os
              projetos.
            </p>
            <button className="btn-sync" onClick={conectarWorkana}>
              Conectar Workana
            </button>
          </div>
        )}

        {/* Scraping em curso sem dados ainda */}
        {scraping.emCurso && oportunidades.length === 0 && (
          <div className="op-empty">
            <span className="material-symbols-outlined op-empty-icon animate-spin">
              sync
            </span>
            <p className="op-empty-title">Buscando projetos na Workana...</p>
            <p className="op-empty-desc">Isso pode levar alguns segundos.</p>
          </div>
        )}

        {/* Erro */}
        {scraping.erro && (
          <div className="op-empty op-empty--erro">
            <span className="material-symbols-outlined op-empty-icon">
              error
            </span>
            <p className="op-empty-title">Erro no scraping</p>
            <p className="op-empty-desc">{scraping.erro}</p>
            <button className="btn-sync" onClick={sincronizar}>
              Tentar novamente
            </button>
          </div>
        )}

        {/* Grid */}
        {exibidas.length > 0 && (
          <div className="op-grid">
            {exibidas.map((op) => (
              <OpportunityCard key={op.id} op={op} />
            ))}
          </div>
        )}

        {/* Cache vazio com sessão ativa */}
        {sessao.ativa &&
          !scraping.emCurso &&
          !scraping.erro &&
          exibidas.length === 0 && (
            <div className="op-empty">
              <span className="material-symbols-outlined op-empty-icon">
                inventory_2
              </span>
              <p className="op-empty-title">Nenhum projeto no cache</p>
              <p className="op-empty-desc">
                Clique em SYNC NOW para buscar os projetos.
              </p>
              <button className="btn-sync" onClick={sincronizar}>
                SYNC NOW
              </button>
            </div>
          )}
      </main>
    </div>
  );
}
