import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface SecretInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean
}

export function SecretInput({ hasError, className, ...props }: SecretInputProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="secret-wrapper">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${className ?? ''} ${hasError ? 'error' : ''}`.trim()}
      />
      <button
        type="button"
        className="secret-toggle"
        onClick={() => setVisible(v => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Ocultar' : 'Mostrar'}
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}
