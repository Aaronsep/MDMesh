import { useEffect, useState } from 'react';
import { AppShell } from '../ui/AppShell';
import { IconCopy } from '../ui/icons';
import { useToast } from '../ui/toast';
import { mintEnrollToken } from '../api/enroll';
import { ApiError } from '../api/client';
import { fmtDateTime } from '../ui/format';
import { QrCanvas } from '../components/QrCanvas';
import { buildProvisioningPayload, serverBaseUrl, agentApkUrl, type WifiSecurity } from '../enroll/provisioning';
import { getConfigurations, type Configuration } from '../api/configurations';

const DEFAULT_CONFIG_KEY = 'mdmesh-default-config';
const SECURITY_VALUES: WifiSecurity[] = ['WPA', 'WEP', 'NONE', 'EAP'];

const STEPS = [
  { title: 'Parte de un equipo reseteado de fábrica', sub: 'En la primera pantalla de bienvenida, aún no inicies sesión.' },
  { title: 'Toca la pantalla 6 veces', sub: 'Se abre el lector de QR. Conéctate al Wi-Fi si lo pide.' },
  { title: 'Escanea este código', sub: 'Android descarga el agente MDMesh y lo pone como Device Owner.' },
  { title: 'Espera el alta', sub: 'El equipo aparece en Equipos tras su primer check-in.' },
];

type Mode = 'qr' | 'token';

export function EnrollPage() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('qr');
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [tokError, setTokError] = useState<string | null>(null);
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [wifiSec, setWifiSec] = useState<WifiSecurity>('WPA');
  const [configs, setConfigs] = useState<Configuration[]>([]);
  const [cfgId, setCfgId] = useState<string>(() => {
    try { return localStorage.getItem(DEFAULT_CONFIG_KEY) ?? ''; } catch { return ''; }
  });

  // Load configurations so the enroller can pull a config's saved provisioning Wi-Fi into the QR.
  useEffect(() => { getConfigurations().then(setConfigs).catch(() => undefined); }, []);

  // When a configuration is selected, fill the Wi-Fi fields from its saved values (still editable).
  useEffect(() => {
    const c = configs.find((x) => String(x.id) === cfgId);
    if (!c) return;
    setWifiSsid(typeof c.wifiSSID === 'string' ? c.wifiSSID : '');
    setWifiPass(typeof c.wifiPassword === 'string' ? c.wifiPassword : '');
    const sec = typeof c.wifiSecurityType === 'string' ? c.wifiSecurityType : '';
    setWifiSec((SECURITY_VALUES as string[]).includes(sec) ? (sec as WifiSecurity) : 'WPA');
  }, [cfgId, configs]);

  async function generate(configurationId?: number) {
    setBusy(true);
    setTokError(null);
    try {
      const res = await mintEnrollToken(configurationId);
      if (res.token) {
        setToken(res.token);
        setExpiresAt(res.expiresAt);
      } else {
        setTokError('The server did not return a token.');
      }
    } catch (err) {
      if (err instanceof ApiError && err.httpStatus === 0) setTokError('Cannot reach the server.');
      else if (err instanceof ApiError) setTokError(err.message || 'Failed to generate a token.');
      else setTokError('Failed to generate a token.');
    } finally {
      setBusy(false);
    }
  }

  // Mint a token whenever the selected configuration changes (including first load): the token
  // BINDS the device to that configuration server-side, so a QR generated for "Kiosk fleet"
  // must never carry a token minted for a different config.
  useEffect(() => {
    const id = Number(cfgId);
    void generate(Number.isFinite(id) && id > 0 ? id : undefined);
    // eslint-disable-next-line
  }, [cfgId]);

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      toast.push('ok', 'Token copiado', 'Token de alta copiado al portapapeles.');
    } catch {
      toast.push('err', 'Falló copiar', 'Selecciona y copia el token a mano.');
    }
  }

  return (
    <AppShell title="Enroll">
      <div className="enroll">
        <div className="enroll-top">
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
            Dar de alta un equipo
          </h1>
          <div className="sp" />
          <span className="seg" role="tablist" aria-label="Método de alta">
            <button className={mode === 'qr' ? 'on' : ''} onClick={() => setMode('qr')}>Escanear QR</button>
            <button className={mode === 'token' ? 'on' : ''} onClick={() => setMode('token')}>Token</button>
          </span>
        </div>

        {mode === 'qr' && (
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Escanea para dar de alta</h2>
              <button className="btn btn-sm" onClick={() => void generate()} disabled={busy}>
                {busy ? 'Generando…' : 'Nuevo código'}
              </button>
            </div>
            {tokError && <div className="banner banner-alert">{tokError}</div>}
            <div className="qr-layout">
              <div>
                <div className="qr-frame">
                  {token ? (
                    <QrCanvas
                      text={buildProvisioningPayload(
                        token,
                        wifiSsid.trim() ? { ssid: wifiSsid, password: wifiPass, security: wifiSec } : undefined,
                      )}
                      size={320}
                    />
                  ) : (
                    <div className="empty"><span className="spin" /> Preparando…</div>
                  )}
                </div>
                <div className="qr-cap">
                  Un solo uso{expiresAt ? ` · vence ${fmtDateTime(expiresAt)}` : ''}
                  {wifiSsid.trim() ? ` · se conecta al Wi-Fi “${wifiSsid.trim()}”` : ''}
                </div>
                <details className="wifi-block" open={!!wifiSsid.trim()}>
                  <summary>Pre-conectar Wi-Fi durante el setup (opcional)</summary>
                  <div className="wifi-fields">
                    {configs.length > 0 && (
                      <label>
                        Cargar Wi-Fi desde una configuración
                        <select className="sel" value={cfgId} onChange={(e) => setCfgId(e.target.value)}>
                          <option value="">— ninguna / a mano —</option>
                          {configs.map((c) => (
                            <option key={String(c.id)} value={String(c.id)}>{c.name}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      Nombre de la red (SSID)
                      <input value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)} placeholder="Office-WiFi" />
                    </label>
                    <label>
                      Seguridad
                      <select className="sel" value={wifiSec} onChange={(e) => setWifiSec(e.target.value as WifiSecurity)}>
                        <option value="WPA">WPA / WPA2</option>
                        <option value="WEP">WEP</option>
                        <option value="NONE">Abierta (sin contraseña)</option>
                      </select>
                    </label>
                    {wifiSec !== 'NONE' && (
                      <label>
                        Contraseña
                        <input type="password" value={wifiPass} onChange={(e) => setWifiPass(e.target.value)} autoComplete="off" />
                      </label>
                    )}
                    <p className="note">
                      El equipo se conecta a esta red durante la provisión (antes de descargar el agente).
                      Ojo: la contraseña queda dentro del QR — sólo muéstralo a quien confíes para dar de alta.
                    </p>
                  </div>
                </details>
              </div>
              <ol className="qr-steps" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {STEPS.map((s, i) => (
                  <li className="qr-step" key={i}>
                    <span className="step-n">{i + 1}</span>
                    <span className="st-tx">{s.title}<span className="sub">{s.sub}</span></span>
                  </li>
                ))}
              </ol>
            </div>
            <p className="note" style={{ padding: '0 20px 16px' }}>
              Server <span className="mono">{serverBaseUrl()}</span> · agent{' '}
              <span className="mono">{agentApkUrl()}</span>. Hospeda el APK del agente en esa URL.
            </p>
          </section>
        )}

        {mode === 'token' && (
          <section className="panel enroll-wrap">
            <div className="panel-head">
              <h2 className="panel-title">Token de alta</h2>
              <button className="btn btn-primary btn-sm" onClick={() => void generate()} disabled={busy}>
                {busy ? 'Generando…' : token ? 'Generar otro' : 'Generar token'}
              </button>
            </div>
            <div style={{ padding: 20 }}>
              {tokError && <div className="banner banner-alert">{tokError}</div>}
              {token ? (
                <>
                  <div className="token-box">
                    <span className="tok">{token}</span>
                    <button className="btn btn-sm btn-ghost" onClick={() => void copy()} aria-label="Copiar token">
                      <IconCopy className="ico" />
                    </button>
                  </div>
                  <p className="note">
                    Token de un solo uso{expiresAt ? `, vence ${fmtDateTime(expiresAt)}` : ''}. Para alta headless
                    o por script — inclúyelo como{' '}
                    <span className="mono">com.mdmesh.ENROLL_TOKEN</span> (with{' '}
                    <span className="mono">com.mdmesh.SERVER_URL</span>). El QR es la vía normal.
                  </p>
                </>
              ) : (
                <p className="note">Para alta headless o por script. Para lo normal, escanea el QR.</p>
              )}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
