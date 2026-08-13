import { useState } from 'react';

// HRS-06/CERT-05: approving requires a typed signature, previewed in a
// script/cursive style before confirming.
export function SignatureModal({ title, message, extraField, onConfirm, onCancel }) {
  const [signature, setSignature] = useState('');
  const [extraValue, setExtraValue] = useState(extraField?.defaultValue || '');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: 420, maxWidth: '90vw' }}>
        <h2>{title}</h2>
        {message && <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>{message}</p>}
        <div className="form-field">
          <label>Type your name to sign</label>
          <input autoFocus value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Your full name" />
        </div>
        {signature && <div className="signature-preview">{signature}</div>}
        {extraField && (
          <div className="form-field" style={{ marginTop: 14 }}>
            <label>{extraField.label}</label>
            <input type={extraField.type || 'text'} value={extraValue} onChange={(e) => setExtraValue(e.target.value)} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button className="btn btn-primary" disabled={!signature.trim()} onClick={() => onConfirm(signature.trim(), extraValue)}>Confirm</button>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
