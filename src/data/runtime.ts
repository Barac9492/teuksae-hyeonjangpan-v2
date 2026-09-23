export type AppMode = "local" | "pilot" | "production";

export interface RuntimeBackendConfig {
  mode: AppMode;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  remoteEnabled: boolean;
  rehearsal: boolean;
  error?: string;
}

export function resolveRuntimeBackend(
  env: Record<string, string | boolean | undefined>,
): RuntimeBackendConfig {
  const rawMode = env.VITE_APP_MODE;
  const mode: AppMode =
    rawMode === "pilot" || rawMode === "production" ? rawMode : "local";
  const supabaseUrl =
    typeof env.VITE_SUPABASE_URL === "string"
      ? env.VITE_SUPABASE_URL.trim()
      : "";
  const supabaseAnonKey =
    typeof env.VITE_SUPABASE_ANON_KEY === "string"
      ? env.VITE_SUPABASE_ANON_KEY.trim()
      : "";
  const complete = Boolean(supabaseUrl && supabaseAnonKey);

  if (mode === "production" && !complete) {
    return {
      mode,
      remoteEnabled: false,
      rehearsal: false,
      error: "운영 환경의 공유 서버 설정이 없어 안전하게 중지했습니다.",
    };
  }
  if (mode === "pilot" && !complete) {
    return {
      mode,
      remoteEnabled: false,
      rehearsal: true,
      error: "공유 서버 미연결: 로컬 운영 리허설로 실행합니다.",
    };
  }
  return {
    mode,
    supabaseUrl: supabaseUrl || undefined,
    supabaseAnonKey: supabaseAnonKey || undefined,
    remoteEnabled: mode !== "local" && complete,
    rehearsal: mode !== "production",
  };
}
