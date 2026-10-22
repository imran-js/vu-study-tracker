import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import App from "./App";
import { supabase, SupabaseRepository } from "../data/supabase";
import { IndexedDbRepository } from "../data/indexeddb";
import type { Snapshot } from "../data/contracts";
import { initialData } from "../domain/model";
import { downloadBackup } from "../features/settings/Settings";

function CloudWorkspace({ session }: { session: Session }) {
  const repository = useMemo(
    () => new SupabaseRepository(supabase!, session.user.id),
    [session.user.id],
  );
  const [ready, setReady] = useState(false);
  const [local, setLocal] = useState<Snapshot>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void repository
      .load()
      .then(async (cloud) => {
        if (!active) return;
        if (cloud) {
          setReady(true);
          return;
        }
        const previous = await new IndexedDbRepository().load();
        if (active) setLocal(previous);
        if (!previous && active) setLocal({ data: initialData(), revision: 0 });
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [repository]);
  async function initialize(importLocal: boolean) {
    setBusy(true);
    setError("");
    try {
      await repository.replace(
        importLocal && local ? local.data : initialData(),
        0,
      );
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cloud setup failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="cloud-account">
        <span>Cloud account: {session.user.email}</span>
        <button
          onClick={async () => {
            const { error } = await supabase!.auth.signOut({ scope: "local" });
            if (error) setError(error.message);
          }}
        >
          Sign out
        </button>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button onClick={() => location.reload()}>Reload</button>
        </div>
      )}
      {ready ? (
        <App repository={repository} cloud accountId={session.user.id} />
      ) : (
        <section className="panel cloud-setup">
          <h1>Set up your cloud study space</h1>
          {!local ? (
            <p>
              {error
                ? "Run supabase/setup.sql in your project’s SQL Editor, then reload."
                : "Checking your cloud records…"}
            </p>
          ) : (
            <>
              <p>
                Your cloud account has no study records yet. Existing browser
                records will stay unchanged.
              </p>
              <p>
                Browser data: {local.data.semesters.length} semesters,{" "}
                {local.data.courses.length} courses,{" "}
                {local.data.lectures.length} lectures,{" "}
                {local.data.assessments.length} assessments.
              </p>
              <p>
                Importing sends all browser study records, notes, and resource
                links to your private account in this Supabase project.
              </p>
              <div className="heading-actions">
                <button onClick={() => downloadBackup(local.data)}>
                  Download browser backup
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void initialize(true)}
                >
                  Import browser records to my cloud account
                </button>
                <button disabled={busy} onClick={() => void initialize(false)}>
                  Start with an empty cloud semester
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

export default function CloudApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [localMode, setLocalMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [signup, setSignup] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoaded(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = signup
        ? await supabase!.auth.signUp({ email, password })
        : await supabase!.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setPassword("");
      if (signup && !result.data.session)
        setMessage(
          "Check your email to confirm your account, then return here and sign in.",
        );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }
  if (!supabase || localMode)
    return (
      <>
        {supabase && (
          <div className="cloud-account">
            <span>Browser-only mode · records do not sync</span>
            <button onClick={() => setLocalMode(false)}>
              Use cloud account
            </button>
          </div>
        )}
        <App />
      </>
    );
  if (!loaded) return <div className="loading">Checking sign-in…</div>;
  if (session)
    return <CloudWorkspace key={session.user.id} session={session} />;
  return (
    <section className="panel cloud-login">
      <h1>Study Desk</h1>
      <p>
        Sign in to access the same private study records on your computer and
        phone.
      </p>
      <form className="stack-form" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete={signup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      <button
        disabled={busy}
        onClick={() => {
          setSignup(!signup);
          setMessage("");
        }}
      >
        {signup ? "Already registered? Sign in" : "Create a study account"}
      </button>
      <button
        disabled={busy}
        onClick={() => {
          setPassword("");
          setLocalMode(true);
        }}
      >
        Continue with browser-only records
      </button>
      <p>
        Cloud writes require internet access. Browser-only records remain
        separate until you explicitly import them. Keep export backups.
      </p>
    </section>
  );
}
