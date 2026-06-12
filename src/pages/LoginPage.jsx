import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isUserAdmin, getUserBranch } from '../config/authConfig';
import styles from './LoginPage.module.css';

function EyeIcon({ isVisible }) {
  if (isVisible) {
    return (
      <svg
        aria-hidden="true"
        className={styles.passwordToggleIcon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17.94 17.94A10.8 10.8 0 0 1 12 20c-5.52 0-10-8-10-8a18.5 18.5 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A10.4 10.4 0 0 1 12 4c5.52 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" />
        <path d="M14.12 14.12a3 3 0 0 1-4.24-4.24" />
        <path d="M3 3l18 18" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={styles.passwordToggleIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s4.48-8 10-8 10 8 10 8-4.48 8-10 8S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const FOOTER_CONTENT = {
  help: {
    title: 'Need Help',
    sections: [
      {
        heading: 'Contact',
        body: 'For access or account support, contact your restaurant administrator or system support team. Include your branch name, registered email, and a short description of the issue.',
      },
      {
        heading: 'Basic Troubleshooting',
        body: 'Check your internet connection, confirm that your email address is entered correctly, and refresh the page if the login form does not respond.',
      },
      {
        heading: 'Login Assistance',
        body: 'Use Forgot Password to request a reset link. For branch access changes, ask the administrator to verify that your email is assigned to the correct branch.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      {
        heading: 'User Data',
        body: 'The portal uses account information such as email addresses and display names to authenticate users and route them to authorized branch tools.',
      },
      {
        heading: 'Restaurant Data',
        body: 'Menu items, order logs, inventory records, analytics, and branch settings are stored for operational reporting and restaurant management.',
      },
      {
        heading: 'Analytics and Storage',
        body: 'Analytics are calculated from real order activity. Firebase services store authentication, database, and configuration data needed to operate the platform.',
      },
    ],
  },
  cookies: {
    title: 'Cookie Notice',
    sections: [
      {
        heading: 'Session Usage',
        body: 'The portal uses browser storage to keep users signed in securely during active sessions.',
      },
      {
        heading: 'Authentication Persistence',
        body: 'When sign-in persistence is enabled, authentication state may remain available on the same device until the user signs out.',
      },
      {
        heading: 'Preferences',
        body: 'Local preferences such as theme choice and AI Analyst cache may be saved in the browser to improve day-to-day usability.',
      },
    ],
  },
  acceptableUse: {
    title: 'Acceptable Use Policy',
    sections: [
      {
        heading: 'Authorized Access',
        body: 'Use this portal only with an account assigned by the restaurant or platform administrator.',
      },
      {
        heading: 'Responsible Usage',
        body: 'Manage menus, inventory, orders, and analytics carefully. Review changes before saving and protect customer and restaurant information.',
      },
      {
        heading: 'Prohibited Activities',
        body: 'Do not share credentials, attempt unauthorized branch access, alter records dishonestly, or export data without permission.',
      },
    ],
  },
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated, loading, error, user, forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [staySignedIn, setStaySignedIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetCooldown, setResetCooldown] = useState(0);
  const [activeFooterContent, setActiveFooterContent] = useState(null);
  const cooldownRef = useRef(null);

  const footerContent = activeFooterContent ? FOOTER_CONTENT[activeFooterContent] : null;

  // Cleanup cooldown interval on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // Handle navigation after login success or if already authenticated.
  useEffect(() => {
    if (isAuthenticated && user) {
      const userEmail = user.email;
      if (isUserAdmin(userEmail)) {
        navigate('/home-admin', { replace: true });
      } else {
        const branchId = getUserBranch(userEmail);
        if (branchId) {
          navigate(`/home/${branchId}`, { replace: true });
        } else {
          // Default fallback or error
          navigate('/home/branch1', { replace: true });
        }
      }
    }
  }, [isAuthenticated, user, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLocalError('');
    setResetSuccess('');

    if (!email.trim()) {
      setLocalError('Please enter your email');
      return;
    }

    if (isForgotPassword) {
      const success = await forgotPassword(email.trim());
      if (success) {
        setResetSuccess('Password reset link sent! Please check your email.');
        // Start 3-minute cooldown
        setResetCooldown(180);
        if (cooldownRef.current) clearInterval(cooldownRef.current);
        cooldownRef.current = setInterval(() => {
          setResetCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(cooldownRef.current);
              cooldownRef.current = null;
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
      return;
    }

    if (!password) {
      setLocalError('Please enter your password');
      return;
    }

    const success = await login(email, password);
    if (!success) {
      setLocalError(error || 'Login failed. Please check your credentials.');
    }
  }

  return (
    <div className={styles.loginPageContainer}>
      <div className={styles.loginContent}>
        <div className={styles.loginBox}>
          <div className={`${styles.logoSection} slide-up slide-up-d1`}>
            <h1 className={styles.brandName}>E-Menu Portal</h1>
            <div className={styles.tagline}>Restaurant Operations Management Platform</div>
          </div>

          <form onSubmit={handleSubmit} className={styles.loginForm}>
            <div className={`${styles.formGroup} slide-up slide-up-d2`}>
              <label htmlFor="email" className={styles.formLabel}>
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                className={styles.formInput}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
              />
            </div>

            {!isForgotPassword && (
              <div className={`${styles.formGroup} slide-up slide-up-d3`}>
                <label htmlFor="password" className={styles.formLabel}>
                  Password
                </label>
                <div className={styles.passwordInputWrapper}>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    className={`${styles.formInput} ${styles.passwordInput}`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className={`${styles.passwordToggle} ${showPassword ? styles.passwordToggleVisible : ''}`}
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Mask password' : 'Reveal password'}
                    aria-pressed={showPassword}
                  >
                    <EyeIcon isVisible={showPassword} />
                  </button>
                </div>
              </div>
            )}

            {(localError || error) && (
              <div className={styles.errorMessage}>
                {localError || (error ? (typeof error === 'object' ? error.message : error) : '')}
              </div>
            )}

            {resetSuccess && (
              <div className={styles.successMessage}>
                {resetSuccess}
              </div>
            )}

            {!isForgotPassword ? (
              <>
                <div className={`${styles.formOptions} slide-up slide-up-d4`}>
                  <label className={styles.staySignedIn}>
                    <input
                      type="checkbox"
                      checked={staySignedIn}
                      onChange={(e) => setStaySignedIn(e.target.checked)}
                      disabled={loading}
                    />
                    Stay signed in
                  </label>
                  <a
                    href="#"
                    className={styles.forgotPassword}
                    onClick={(e) => {
                      e.preventDefault();
                      setIsForgotPassword(true);
                      setLocalError('');
                      setResetSuccess('');
                    }}
                  >
                    Forgot Password?
                  </a>
                </div>

                <button
                  type="submit"
                  className={`${styles.loginSubmitButton} slide-up slide-up-d5`}
                  disabled={loading}
                >
                  {loading ? 'Logging in...' : 'Log In'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="submit"
                  className={styles.loginSubmitButton}
                  disabled={loading || resetCooldown > 0}
                >
                  {loading ? 'Sending...' : resetCooldown > 0 ? `Resend in ${Math.floor(resetCooldown / 60)}:${String(resetCooldown % 60).padStart(2, '0')}` : 'Send Reset Link'}
                </button>
                <a
                  className={styles.backToLogin}
                  onClick={() => {
                    setIsForgotPassword(false);
                    setLocalError('');
                    setResetSuccess('');
                  }}
                >
                  Back to Login
                </a>
              </>
            )}
          </form>

          <div className={`${styles.footer} slide-up slide-up-d5`}>
            <button type="button" className={styles.footerLink} onClick={() => setActiveFooterContent('help')}>Need Help</button>
            <button type="button" className={styles.footerLink} onClick={() => setActiveFooterContent('privacy')}>Privacy Policy</button>
            <button type="button" className={styles.footerLink} onClick={() => setActiveFooterContent('cookies')}>Cookie Notice</button>
            <button type="button" className={styles.footerLink} onClick={() => setActiveFooterContent('acceptableUse')}>Acceptable Use Policy</button>
          </div>
          <div className={`${styles.poweredBy} slide-up slide-up-d5`}>Powered by Touch</div>

        </div>
      </div>

      {footerContent && (
        <div className={styles.infoModalOverlay} onClick={() => setActiveFooterContent(null)}>
          <div className={styles.infoModal} role="dialog" aria-modal="true" aria-labelledby="footer-info-title" onClick={(e) => e.stopPropagation()}>
            <div className={styles.infoModalHeader}>
              <h2 id="footer-info-title">{footerContent.title}</h2>
              <button type="button" className={styles.infoModalClose} onClick={() => setActiveFooterContent(null)} aria-label="Close dialog">
                x
              </button>
            </div>
            <div className={styles.infoModalBody}>
              {footerContent.sections.map((section) => (
                <section key={section.heading} className={styles.infoModalSection}>
                  <h3>{section.heading}</h3>
                  <p>{section.body}</p>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
