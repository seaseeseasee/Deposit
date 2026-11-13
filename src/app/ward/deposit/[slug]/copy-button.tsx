'use client';
import { useState } from 'react';

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard blocked: the number stays visible and selectable */
        }
      }}
    >
      {done ? 'คัดลอกแล้ว ✓' : 'คัดลอกเลขบัญชี'}
    </button>
  );
}
