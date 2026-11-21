import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../api';
import aviraLogo from '../assets/Avira_logo.png';
import headerLogo from '../assets/Avira_logo_text.png';
import loginNecklace from '../assets/necklaceimage_login.png';
import loginRing from '../assets/ring.png';
import earringsImage from '../assets/earings.png';

function BrandMark({ compact = false }) {
  return <img className={`login-brand-image${compact ? ' login-brand-image-compact' : ''}`} src={aviraLogo} alt="Avira Jewels" />;
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19v-1.4a6.5 6.5 0 0 1 13 0V19h-13Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5.5" y="10" width="13" height="10" rx="2" />
      <path d="M8.5 10V7a3.5 3.5 0 1 1 7 0v3M12 14v2.5" />
    </svg>
  );
}

function EyeIcon({ hidden }) {
  return hidden ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3 21 21M10.6 10.7a2 2 0 0 0 2.7 2.7" />
      <path d="M9.9 5.3A10.8 10.8 0 0 1 12 5c5.2 0 8.5 5.2 8.5 7s-1.1 3.5-3 4.9M6.2 6.4C3.9 7.9 2.5 10.6 2.5 12c0 1.8 3.3 7 9.5 7 1.3 0 2.5-.3 3.5-.8" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.3-7 9.5-7 9.5 7 9.5 7-3.3 7-9.5 7-9.5-7-9.5-7Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      await login(f.username, f.password);
      nav('/');
    } catch (x) {
      setErr(errMsg(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-showcase" aria-label="Aviraj jewellery billing">
        <div className="login-showcase-glow login-showcase-glow-one" />
        <div className="login-showcase-glow login-showcase-glow-two" />
        <header className="login-showcase-header">
          <img className="login-header-logo" src={headerLogo} alt="Avira" />
          <span className="login-edition">JEWELLERY · BILLING · INVENTORY</span>
        </header>

        <div className="login-editorial-grid">
          <article className="login-feature-photo">
            <img src={loginNecklace} alt="Model wearing an emerald and gold necklace" />
            <div className="login-photo-shade" />
            <div className="login-feature-copy">
              <span className="login-eyebrow">THE AVIRAJ EDIT</span>
              <h2>Made to be<br />remembered.</h2>
            </div>
            <span className="login-photo-index">01 / 03</span>
          </article>

          <div className="login-editorial-side">
            <article className="login-editorial-card login-ring-card">
              <img className="login-ring-image" src={loginRing} alt="Diamond ring displayed on burgundy velvet" />
              <div className="login-ring-card-overlay" />
              <div className="login-editorial-card-copy">
                <span className="login-eyebrow">THOUGHTFULLY CRAFTED</span>
                <h3>Modern<br />heirlooms</h3>
              </div>
              <span className="login-card-number">02</span>
            </article>

            <article className="login-editorial-card login-detail-card">
              <img src={earringsImage} alt="Ruby and diamond drop earrings on burgundy velvet" />
              <div className="login-detail-overlay" />
              <div className="login-editorial-card-copy">
                <span className="login-eyebrow">EVERY DETAIL, ACCOUNTED FOR</span>
                <h3>Daily<br />luxury</h3>
              </div>
              <span className="login-card-number">03</span>
            </article>
          </div>
        </div>

        <footer className="login-showcase-footer">
          <div className="login-story">
            <p className="login-story-kicker">A better way to do business</p>
            <h1>Scan the tag. Bill in <em>seconds.</em></h1>
            <p className="login-story-body">Weight, purity, making and tax, worked out for every piece, every time.</p>
          </div>
          <div className="login-benefits" aria-label="Platform benefits">
            <div className="login-benefit">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.2 5.3 5.8.5-4.4 3.8 1.3 5.7-4.9-3-4.9 3 1.3-5.7L4 8.8l5.8-.5L12 3Z" /></svg>
              <span>Accurate<br />billing</span>
            </div>
            <div className="login-benefit">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5.5c0 4.4 2.9 7.5 7 9.5 4.1-2 7-5.1 7-9.5V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
              <span>Reliable<br />&amp; secure</span>
            </div>
            <div className="login-benefit">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9m5 10V5m5 14v-7m5 7V3M2.5 19.5h19" /><path d="m4 6 5 2 5-4 5 2" /></svg>
              <span>Smart<br />inventory</span>
            </div>
          </div>
        </footer>
      </section>

      <section className="login-panel" aria-label="Sign in">
        <div className="login-panel-decoration" aria-hidden="true" />
        <div className="login-form-wrap">
          <div className="login-mobile-brand"><BrandMark compact /></div>
          <div className="login-form-heading">
            <div className="login-form-logo"><BrandMark compact /></div>
            <p className="login-form-overline">WELCOME TO AVIRAJ</p>
            <h2>Sign in</h2>
            <p className="login-form-subtitle">Welcome back! Please sign in to continue.</p>
          </div>

          <form onSubmit={submit} className="login-form" noValidate>
            {err && <div role="alert" aria-live="polite" className="login-error">{err}</div>}

            <div className="login-field">
              <label htmlFor="u"><UserIcon />Username</label>
              <input
                id="u"
                name="username"
                type="text"
                autoComplete="username"
                autoFocus
                placeholder="Enter your username"
                value={f.username}
                onChange={(e) => setF({ ...f, username: e.target.value })}
                aria-invalid={Boolean(err)}
              />
            </div>

            <div className="login-field">
              <label htmlFor="p"><LockIcon />Password</label>
              <div className="login-password-wrap">
                <input
                  id="p"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={f.password}
                  onChange={(e) => setF({ ...f, password: e.target.value })}
                  aria-invalid={Boolean(err)}
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  <EyeIcon hidden={showPassword} />
                </button>
              </div>
            </div>

            <button className="login-submit" type="submit" disabled={busy}>
              <span>{busy ? 'Signing in…' : 'Sign in'}</span>
              {!busy && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>}
              {busy && <span className="login-spinner" aria-hidden="true" />}
            </button>
          </form>

          <div className="login-trust"><span /><p><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5.5c0 4.4 2.9 7.5 7 9.5 4.1-2 7-5.1 7-9.5V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>Secure &amp; trusted</p><span /></div>
          <p className="login-panel-note">Your workspace, ready when you are.</p>
        </div>
      </section>
    </main>
  );
}
