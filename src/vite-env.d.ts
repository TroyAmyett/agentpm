/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_LLM_PROVIDER?: string
  readonly VITE_CMS_BASE_URL?: string
  readonly VITE_CANVAS_BASE_URL?: string
  readonly VITE_CANVAS_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
