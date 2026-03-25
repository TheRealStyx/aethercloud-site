import React, { useState, useEffect, useRef, useCallback } from "react";

const API_URL = "http://127.0.0.1:5002";
const HEADERS = {
  Authorization: "Bearer workanabot-dev-token",
  "Content-Type": "application/json",
};

const STATUS_OPTIONS = [
  { value: "em_elaboracao", label: "Em Elaboração" },
  { value: "proposta_pronta", label: "Proposta Pronta" },
  { value: "enviada", label: "Enviada" },
  { value: "ganho", label: "Ganho" },
  { value: "perdido", label: "Perdido" },
];

export default function ProjetoWorkspacePage({ projeto, onVoltar }) {
  const op = projeto.oportunidade || {};

  const [proposta, setProposta] = useState(projeto.proposta_texto || "");
  const [status, setStatus] = useState(projeto.status || "em_elaboracao");
  const [salvando, setSalvando] = useState(false);

  // AI panel
  const [showIA, setShowIA] = useState(false);
  const [instrucaoIA, setInstrucaoIA] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erroIA, setErroIA] = useState("");

  // Preview modal
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [carregandoPreview, setCarregandoPreview] = useState(false);

  // Export
  const [exportando, setExportando] = useState(false);

  const debounceRef = useRef(null);
  const propostaRef = useRef(proposta);
  propostaRef.current = proposta;

  // ── Auto-save debounced ───────────────────────────────────────────────────
  const salvarProposta = useCallback(
    async (texto, novoStatus) => {
      setSalvando(true);
      try {
        await fetch(`${API_URL}/api/projetos-salvos/${projeto.id}`, {
          method: "PUT",
          headers: HEADERS,
          body: JSON.stringify({
            proposta_texto: texto,
            status: novoStatus,
          }),
        });
      } catch (err) {
        console.error("Erro ao salvar proposta:", err);
      } finally {
        setSalvando(false);
      }
    },
    [projeto.id]
  );

  const handlePropostaChange = (e) => {
    const valor = e.target.value;
    setProposta(valor);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      salvarProposta(valor, status);
    }, 800);
  };

  const handleStatusChange = async (e) => {
    const novoStatus = e.target.value;
    setStatus(novoStatus);
    await salvarProposta(propostaRef.current, novoStatus);
  };

  // ── Salvar ao desmontar se houver alterações pendentes ───────────────────
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        salvarProposta(propostaRef.current, status);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Gerar com IA ─────────────────────────────────────────────────────────
  const gerarComIA = async () => {
    setGerando(true);
    setErroIA("");
    try {
      const res = await fetch(`${API_URL}/api/proposta/ia`, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
          projeto_id: projeto.id,
          instrucao: instrucaoIA,
        }),
      });
      const data = await res.json();
      if (data.erro) {
        setErroIA(data.erro);
        return;
      }
      setProposta(data.texto || "");
      setShowIA(false);
      setInstrucaoIA("");
      // Salva imediatamente
      await salvarProposta(data.texto || "", status);
    } catch (err) {
      setErroIA("Erro de conexão com o servidor.");
    } finally {
      setGerando(false);
    }
  };

  // ── Preview ───────────────────────────────────────────────────────────────
  const abrirPreview = async () => {
    // Primeiro exporta para ter o DOCX atualizado
    setCarregandoPreview(true);
    setShowPreview(true);
    try {
      // Salva o texto atual antes de exportar
      await salvarProposta(proposta, status);

      const expRes = await fetch(`${API_URL}/api/proposta/exportar`, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ projeto_id: projeto.id }),
      });
      if (!expRes.ok) {
        const err = await expRes.json();
        setPreviewHtml(`<p style="color:red">Erro ao exportar: ${err.erro}</p>`);
        return;
      }

      const prevRes = await fetch(`${API_URL}/api/proposta/preview`, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ projeto_id: projeto.id }),
      });
      const data = await prevRes.json();
      if (data.erro) {
        setPreviewHtml(`<p style="color:red">Erro: ${data.erro}</p>`);
      } else {
        setPreviewHtml(data.html || "<p>Documento vazio.</p>");
      }
    } catch (err) {
      setPreviewHtml(`<p style="color:red">Erro de conexão.</p>`);
    } finally {
      setCarregandoPreview(false);
    }
  };

  // ── Exportar DOCX ─────────────────────────────────────────────────────────
  const exportarDocx = async () => {
    setExportando(true);
    try {
      await salvarProposta(proposta, status);

      const expRes = await fetch(`${API_URL}/api/proposta/exportar`, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ projeto_id: projeto.id }),
      });
      if (!expRes.ok) {
        const err = await expRes.json();
        alert(`Erro ao exportar: ${err.erro}`);
        return;
      }

      const dlRes = await fetch(
        `${API_URL}/api/proposta/download/${projeto.id}`,
        { headers: { Authorization: "Bearer workanabot-dev-token" } }
      );
      if (!dlRes.ok) {
        alert("Erro ao baixar o arquivo.");
        return;
      }

      const blob = await dlRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const tituloSlug = (op.titulo || "proposta").slice(0, 30).replace(/\s+/g, "_");
      a.download = `proposta_${tituloSlug}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Erro de conexão ao exportar.");
    } finally {
      setExportando(false);
    }
  };

  // ── Enviar ao cliente (preenche proposta na Workana) ─────────────────────
  const enviarAoCliente = () => {
    if (!op.url) {
      alert("URL do projeto não disponível.");
      return;
    }
    if (window.electronAPI?.preencherProposta) {
      window.electronAPI.preencherProposta(op.url, proposta);
    } else {
      window.open(op.url, "_blank");
    }
  };

  // ── Abrir link do projeto ─────────────────────────────────────────────────
  const abrirLink = () => {
    if (!op.url) return;
    if (window.electronAPI?.abrirProjeto) {
      window.electronAPI.abrirProjeto(op.url);
    } else {
      window.open(op.url, "_blank");
    }
  };

  return (
    <div className="workspace-container">
      {/* ── COLUNA ESQUERDA: detalhes do job ── */}
      <div className="workspace-left">
        <button className="btn-voltar" onClick={onVoltar}>
          ← Voltar
        </button>

        <h2 className="workspace-job-titulo">{op.titulo || "Projeto"}</h2>

        <div className="workspace-field">
          <label className="workspace-label">Status</label>
          <select
            className="workspace-select"
            value={status}
            onChange={handleStatusChange}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {op.valor && (
          <div className="workspace-field">
            <label className="workspace-label">Orçamento</label>
            <span className="workspace-valor">{op.valor}</span>
          </div>
        )}

        {op.skills?.length > 0 && (
          <div className="workspace-field">
            <label className="workspace-label">Skills</label>
            <div className="workspace-tags">
              {op.skills.map((s, i) => (
                <span key={i} className="detalhe-tag">{s}</span>
              ))}
            </div>
          </div>
        )}

        {op.sobre_projeto && (
          <div className="workspace-field">
            <label className="workspace-label">Sobre este projeto</label>
            <p className="workspace-text">{op.sobre_projeto}</p>
          </div>
        )}

        {op.descricao && (
          <div className="workspace-field">
            <label className="workspace-label">Descrição</label>
            <p className="workspace-text">{op.descricao}</p>
          </div>
        )}

        {op.url && (
          <div className="workspace-field">
            <button className="btn-link-job" onClick={abrirLink}>
              Abrir no Workana
            </button>
          </div>
        )}
      </div>

      {/* ── COLUNA DIREITA: editor de proposta ── */}
      <div className="workspace-right">
        <div className="workspace-editor-header">
          <h3 className="workspace-editor-titulo">Proposta Comercial</h3>
          {salvando && <span className="workspace-salvando">Salvando...</span>}
        </div>

        {/* Toolbar */}
        <div className="workspace-toolbar">
          <button
            className="btn-toolbar"
            onClick={() => {
              setShowIA(!showIA);
              setErroIA("");
            }}
            title="Gerar proposta com Inteligência Artificial"
          >
            Gerar com IA
          </button>
          <button
            className="btn-toolbar"
            onClick={abrirPreview}
            title="Visualizar proposta formatada"
          >
            Preview
          </button>
          <button
            className="btn-toolbar"
            onClick={exportarDocx}
            disabled={exportando}
            title="Exportar como documento Word"
          >
            {exportando ? "Exportando..." : "Exportar .docx"}
          </button>
          <button
            className="btn-toolbar btn-toolbar--primary"
            onClick={enviarAoCliente}
            title="Abrir Workana com proposta pré-preenchida"
          >
            Enviar ao cliente
          </button>
        </div>

        {/* Painel IA */}
        {showIA && (
          <div className="ia-panel">
            <p className="ia-panel-label">
              Instrução para a IA (opcional):
            </p>
            <textarea
              className="ia-instrucao"
              value={instrucaoIA}
              onChange={(e) => setInstrucaoIA(e.target.value)}
              placeholder="Ex: adapte para projeto de e-commerce, prazo de 30 dias, valor R$ 5.000, mencione experiência com React"
              rows={3}
            />
            {erroIA && <p className="ia-erro">{erroIA}</p>}
            <div className="ia-panel-actions">
              <button
                className="btn-sync"
                onClick={gerarComIA}
                disabled={gerando}
              >
                {gerando ? "Gerando..." : "Gerar"}
              </button>
              <button
                className="btn-cancelar"
                onClick={() => {
                  setShowIA(false);
                  setErroIA("");
                  setInstrucaoIA("");
                }}
                disabled={gerando}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Textarea principal */}
        <textarea
          className="proposta-textarea"
          value={proposta}
          onChange={handlePropostaChange}
          placeholder="Escreva sua proposta aqui... ou use a IA para gerar automaticamente."
          spellCheck={false}
        />
      </div>

      {/* ── MODAL DE PREVIEW ── */}
      {showPreview && (
        <div className="preview-modal" onClick={() => setShowPreview(false)}>
          <div
            className="preview-modal-inner"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="preview-modal-header">
              <h3>Preview da Proposta</h3>
              <button
                className="preview-modal-close"
                onClick={() => setShowPreview(false)}
              >
                Fechar
              </button>
            </div>
            <div className="preview-modal-body">
              {carregandoPreview ? (
                <div className="op-empty">
                  <span className="material-symbols-outlined op-empty-icon animate-spin">sync</span>
                  <p>Gerando preview...</p>
                </div>
              ) : (
                <div
                  className="preview-html-content"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
