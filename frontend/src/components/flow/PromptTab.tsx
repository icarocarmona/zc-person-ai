import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, RotateCcw } from 'lucide-react'
import { getPrompt, savePrompt, resetPrompt } from '../../api/client'

export function PromptTab() {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['prompt'],
    queryFn: getPrompt,
  })

  useEffect(() => {
    if (data) {
      setText(data.system_prompt || data.default_prompt)
      setDirty(false)
    }
  }, [data])

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg })
    setTimeout(() => setToast(null), 3500)
  }

  const saveMutation = useMutation({
    mutationFn: () => savePrompt(text),
    onSuccess: () => {
      setDirty(false)
      queryClient.invalidateQueries({ queryKey: ['prompt'] })
      showToast(true, 'Prompt salvo com sucesso!')
    },
    onError: (e: Error) => showToast(false, e.message),
  })

  const resetMutation = useMutation({
    mutationFn: resetPrompt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompt'] })
      showToast(true, 'Prompt restaurado para o padrão.')
    },
    onError: (e: Error) => showToast(false, e.message),
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <div className="spinner spinner-dark" style={{ width: 24, height: 24 }} />
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">
            Prompt do Sistema
            {data?.is_default && (
              <span className="badge badge-yellow" style={{ marginLeft: 8 }}>
                Usando padrão
              </span>
            )}
          </div>
          <div className="card-desc">
            Instruções enviadas à IA para cada análise. Deixe em branco para usar o padrão.
          </div>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {text.length} chars
        </span>
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        <textarea
          className="prompt-textarea"
          value={text}
          onChange={e => { setText(e.target.value); setDirty(true) }}
          spellCheck={false}
        />
      </div>
      <div
        className="actions-bar"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-alt)' }}
      >
        <button
          className="btn btn-secondary"
          onClick={() => resetMutation.mutate()}
          disabled={resetMutation.isPending || data?.is_default}
        >
          <RotateCcw size={14} /> Restaurar padrão
        </button>
        <button
          className="btn btn-primary"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !dirty}
        >
          {saveMutation.isPending ? (
            <><div className="spinner" /> Salvando...</>
          ) : (
            <><Save size={14} /> Salvar</>
          )}
        </button>
      </div>

      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.ok ? 'success' : 'error'}`}>
            <span style={{ color: toast.ok ? 'var(--success)' : 'var(--error)' }}>
              {toast.ok ? '✓' : '✕'}
            </span>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  )
}
