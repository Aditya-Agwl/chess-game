import { GoogleLogin } from "@react-oauth/google";
import type { CredentialResponse } from "@react-oauth/google";

type Props = {
  authLoading: boolean;
  onSuccess: (response: CredentialResponse) => Promise<void>;
  onError: () => void;
};

export default function AuthModal({ authLoading, onSuccess, onError }: Props) {
  return (
    <div className="modal-backdrop auth-backdrop" role="presentation">
      <section className="result-modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="signin-title">
        <h2 id="signin-title">Sign In To Continue</h2>
        <p>Use Google to unlock gameplay and your game history.</p>
        <div className="auth-login-wrap">
          <GoogleLogin
            useOneTap
            auto_select
            onSuccess={onSuccess}
            onError={onError}
          />
        </div>
        {authLoading && <p className="auth-loading">Signing in...</p>}
      </section>
    </div>
  );
}
