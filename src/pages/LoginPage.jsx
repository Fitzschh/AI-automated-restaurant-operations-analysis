import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isUserAdmin, getUserBranch } from '../config/authConfig';
import styles from './LoginPage.module.css';

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
  const cooldownRef = useRef(null);

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
            <h1 className={styles.brandName}>E-Menu Login</h1>
            <div className={styles.tagline}>To efficient and convenient dining</div>
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
                    tabIndex="-1"
                  >
                    {showPassword ? 'Hide' : 'Show'}
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
            <a href="#" className={styles.footerLink}>Need Help</a>
            <a href="#" className={styles.footerLink}>Privacy Policy</a>
            <a href="#" className={styles.footerLink}>Cookie Notice</a>
            <a href="#" className={styles.footerLink}>Acceptable Use Policy</a>
          </div>

        </div>
      </div>
    </div>
  );
}
