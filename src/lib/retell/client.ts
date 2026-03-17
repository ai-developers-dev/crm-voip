/**
 * Retell AI REST API Client
 * Base URL: https://api.retellai.com
 * Docs: https://docs.retellai.com/api-references
 */

const BASE_URL = "https://api.retellai.com";

// ── Helpers ──────────────────────────────────────────────────────────

async function retellFetch<T>(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    let errorMessage = `Retell API error: ${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) {
        errorMessage = `Retell API error: ${errorBody.message}`;
      } else if (errorBody?.error) {
        errorMessage = `Retell API error: ${errorBody.error}`;
      }
    } catch {
      // If we can't parse the error body, use the status text
    }
    throw new Error(errorMessage);
  }

  // DELETE endpoints may return 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────

export interface RetellResponseEngine {
  type: "retell-llm";
  llm_id: string;
}

export interface CreateAgentConfig {
  response_engine: RetellResponseEngine;
  voice_id: string;
  agent_name?: string;
  language?: string;
  webhook_url?: string;
  responsiveness?: number;
  interruption_sensitivity?: number;
  enable_backchannel?: boolean;
  ambient_sound?: string;
  max_call_duration_ms?: number;
  end_call_after_silence_ms?: number;
  enable_voicemail_detection?: boolean;
  voicemail_message?: string;
  voice_speed?: number;
  voice_temperature?: number;
  voice_model?: string;
  begin_message_delay_ms?: number;
  post_call_analysis_data?: unknown;
  analysis_summary_prompt?: string;
  analysis_successful_prompt?: string;
}

export interface UpdateAgentConfig extends Partial<CreateAgentConfig> {}

export interface RetellAgent {
  agent_id: string;
  agent_name?: string;
  voice_id: string;
  response_engine: RetellResponseEngine;
  language?: string;
  [key: string]: unknown;
}

export interface CreateLlmConfig {
  model?: string;
  general_prompt?: string;
  begin_message?: string;
  model_temperature?: number;
  general_tools?: Array<
    | { type: "end_call"; name?: string; description?: string }
    | { type: "transfer_call"; number: string; description?: string; name?: string }
    | { type: "send_sms"; [key: string]: unknown }
    | { type: string; [key: string]: unknown }
  >;
  starting_state?: string;
}

export interface UpdateLlmConfig extends Partial<CreateLlmConfig> {}

export interface RetellLlm {
  llm_id: string;
  model?: string;
  general_prompt?: string;
  begin_message?: string;
  [key: string]: unknown;
}

export interface CreatePhoneCallConfig {
  from_number: string;
  to_number: string;
  override_agent_id?: string;
  metadata?: Record<string, unknown>;
  retell_llm_dynamic_variables?: Record<string, string>;
}

export interface RetellCall {
  call_id: string;
  agent_id: string;
  call_status: string;
  start_timestamp?: number;
  end_timestamp?: number;
  transcript?: string;
  transcript_object?: unknown;
  recording_url?: string;
  call_analysis?: {
    call_summary?: string;
    user_sentiment?: string;
    call_successful?: boolean;
    custom_analysis_data?: unknown;
  };
  disconnection_reason?: string;
  call_cost_cents?: number;
  [key: string]: unknown;
}

export interface ListCallsFilters {
  filter_criteria?: {
    agent_id?: string[];
    before_start_timestamp?: number;
    after_start_timestamp?: number;
    before_end_timestamp?: number;
    after_end_timestamp?: number;
  };
  sort_order?: "ascending" | "descending";
  limit?: number;
  pagination_key?: string;
}

export interface ImportPhoneNumberConfig {
  phone_number: string;
  termination_uri: string;
  inbound_agent_id?: string;
  outbound_agent_id?: string;
  nickname?: string;
}

export interface UpdatePhoneNumberConfig {
  inbound_agent_id?: string | null;
  outbound_agent_id?: string | null;
  nickname?: string;
}

export interface RetellPhoneNumber {
  phone_number: string;
  phone_number_pretty: string;
  inbound_agent_id?: string;
  outbound_agent_id?: string;
  nickname?: string;
  [key: string]: unknown;
}

export interface RetellVoice {
  voice_id: string;
  voice_name: string;
  provider: string;
  gender: string;
  accent?: string;
  preview_audio_url?: string;
  [key: string]: unknown;
}

// ── Agent CRUD ───────────────────────────────────────────────────────

export async function createAgent(
  apiKey: string,
  config: CreateAgentConfig
): Promise<RetellAgent> {
  return retellFetch<RetellAgent>(apiKey, "POST", "/v2/create-agent", config);
}

export async function updateAgent(
  apiKey: string,
  agentId: string,
  config: UpdateAgentConfig
): Promise<RetellAgent> {
  return retellFetch<RetellAgent>(
    apiKey,
    "PATCH",
    `/v2/update-agent/${agentId}`,
    config
  );
}

export async function deleteAgent(
  apiKey: string,
  agentId: string
): Promise<void> {
  return retellFetch<void>(apiKey, "DELETE", `/v2/delete-agent/${agentId}`);
}

export async function getAgent(
  apiKey: string,
  agentId: string
): Promise<RetellAgent> {
  return retellFetch<RetellAgent>(apiKey, "GET", `/v2/get-agent/${agentId}`);
}

export async function listAgents(apiKey: string): Promise<RetellAgent[]> {
  return retellFetch<RetellAgent[]>(apiKey, "GET", "/v2/list-agents");
}

// ── LLM CRUD ─────────────────────────────────────────────────────────

export async function createRetellLlm(
  apiKey: string,
  config: CreateLlmConfig
): Promise<RetellLlm> {
  return retellFetch<RetellLlm>(apiKey, "POST", "/v2/create-retell-llm", config);
}

export async function updateRetellLlm(
  apiKey: string,
  llmId: string,
  config: UpdateLlmConfig
): Promise<RetellLlm> {
  return retellFetch<RetellLlm>(
    apiKey,
    "PATCH",
    `/v2/update-retell-llm/${llmId}`,
    config
  );
}

// ── Phone Calls ──────────────────────────────────────────────────────

export async function createPhoneCall(
  apiKey: string,
  config: CreatePhoneCallConfig
): Promise<RetellCall> {
  return retellFetch<RetellCall>(apiKey, "POST", "/v2/create-phone-call", config);
}

export interface RegisterPhoneCallConfig {
  agent_id: string;
  metadata?: Record<string, any>;
  retell_llm_dynamic_variables?: Record<string, string>;
}

export interface RegisterPhoneCallResponse {
  call_id: string;
  agent_id: string;
  call_status: string;
}

export async function registerPhoneCall(
  apiKey: string,
  config: RegisterPhoneCallConfig
): Promise<RegisterPhoneCallResponse> {
  return retellFetch<RegisterPhoneCallResponse>(apiKey, "POST", "/v2/register-phone-call", config);
}

export async function getCall(
  apiKey: string,
  callId: string
): Promise<RetellCall> {
  return retellFetch<RetellCall>(apiKey, "GET", `/v2/get-call/${callId}`);
}

export async function listCalls(
  apiKey: string,
  filters?: ListCallsFilters
): Promise<RetellCall[]> {
  if (filters) {
    return retellFetch<RetellCall[]>(apiKey, "POST", "/v2/list-calls", filters);
  }
  return retellFetch<RetellCall[]>(apiKey, "POST", "/v2/list-calls", {});
}

// ── Phone Numbers ────────────────────────────────────────────────────

export async function importPhoneNumber(
  apiKey: string,
  config: ImportPhoneNumberConfig
): Promise<RetellPhoneNumber> {
  return retellFetch<RetellPhoneNumber>(
    apiKey,
    "POST",
    "/v2/import-phone-number",
    config
  );
}

export async function updatePhoneNumber(
  apiKey: string,
  phoneNumber: string,
  config: UpdatePhoneNumberConfig
): Promise<RetellPhoneNumber> {
  return retellFetch<RetellPhoneNumber>(
    apiKey,
    "PATCH",
    `/v2/update-phone-number/${encodeURIComponent(phoneNumber)}`,
    config
  );
}

// ── Voices ───────────────────────────────────────────────────────────

export async function listVoices(apiKey: string): Promise<RetellVoice[]> {
  return retellFetch<RetellVoice[]>(apiKey, "GET", "/v2/list-voices");
}
