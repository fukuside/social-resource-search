import { useEffect, useRef, useState } from 'react';

let scriptReady;

function loadGoogleIdentity() {
  if (!scriptReady) {
    scriptReady = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve(window.google.accounts.id);
      script.onerror = () => {
        script.remove();
        scriptReady = undefined;
        reject(new Error('Googleログインを読み込めませんでした。ページを再読み込みしてください。'));
      };
      document.head.append(script);
    });
  }
  return scriptReady;
}

export default function GoogleStaffLogin({ onCredential, busy, error }) {
  const target = useRef(null);
  const callback = useRef(onCredential);
  const [setupError, setSetupError] = useState('');

  useEffect(() => { callback.current = onCredential; }, [onCredential]);
  useEffect(() => {
    const button = target.current;
    const controller = new AbortController();
    async function setup() {
      try {
        const response = await fetch('/api/staff', { signal: controller.signal });
        const config = await response.json();
        if (!response.ok || !config.ok) throw new Error(config.error || 'Googleログインを利用できません。');
        const google = await loadGoogleIdentity();
        if (controller.signal.aborted) return;
        google.initialize({
          client_id: config.clientId,
          callback: ({ credential }) => {
            if (!controller.signal.aborted && credential) callback.current(credential);
          },
        });
        google.renderButton(button, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'ja' });
      } catch (failure) {
        if (!controller.signal.aborted) setSetupError(failure.message);
      }
    }
    setup();
    return () => {
      controller.abort();
      button.replaceChildren();
    };
  }, []);

  return (
    <div className="space-y-2" aria-busy={busy}>
      <div id="staff-google-login" ref={target} tabIndex={-1} />
      {busy && <p role="status">アカウントを確認中…</p>}
      {(error || setupError) && <p role="alert" className="whitespace-pre-line break-all text-sm text-red-700">{error || setupError}</p>}
    </div>
  );
}
