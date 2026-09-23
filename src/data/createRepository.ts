import type { AppConfig } from "../domain/config";
import type { AppRepository } from "./AppRepository";
import { LocalAppRepository } from "./LocalAppRepository";
import type { RuntimeBackendConfig } from "./runtime";
import { SupabaseAppRepository } from "./remote/SupabaseAppRepository";
import { SupabaseGateway } from "./remote/SupabaseGateway";
export function createRepository(
  config: AppConfig,
  runtime: RuntimeBackendConfig,
): AppRepository {
  if (
    !runtime.remoteEnabled ||
    !runtime.supabaseUrl ||
    !runtime.supabaseAnonKey
  )
    return new LocalAppRepository(config);
  return new SupabaseAppRepository(
    config,
    new SupabaseGateway(runtime.supabaseUrl, runtime.supabaseAnonKey),
  );
}
