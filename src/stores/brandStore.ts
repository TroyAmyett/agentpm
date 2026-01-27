// Brand Store
// Manages brand configuration, templates, and document numbering

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, isAuthError, handleAuthError } from '@/services/supabase/client'
import type {
  AccountBrandConfig,
  BrandConfig,
  AccountTemplate,
  TemplateType,
  BrandExtractionResult,
  DocumentTypeCode,
  DocumentNumber,
} from '@/types/brand'

// ============================================================================
// TYPES
// ============================================================================

interface BrandState {
  // State
  brandConfig: AccountBrandConfig | null
  templates: AccountTemplate[]
  isLoading: boolean
  error: string | null

  // Wizard state
  extractionResult: BrandExtractionResult | null
  isExtracting: boolean

  // Getters
  hasCompletedSetup: () => boolean
  getDefaultTemplate: (type: TemplateType) => AccountTemplate | null

  // Brand config actions
  fetchBrandConfig: (accountId: string) => Promise<AccountBrandConfig | null>
  saveBrandConfig: (accountId: string, config: Partial<BrandConfig>, userId: string) => Promise<void>
  completeBrandSetup: (accountId: string, userId: string) => Promise<void>
  resetBrandConfig: (accountId: string) => Promise<void>

  // Template actions
  fetchTemplates: (accountId: string) => Promise<void>
  createTemplate: (
    accountId: string,
    file: Blob,
    metadata: { type: TemplateType; name: string; description?: string },
    userId: string
  ) => Promise<AccountTemplate>
  deleteTemplate: (templateId: string) => Promise<void>
  setDefaultTemplate: (templateId: string, templateType: TemplateType, accountId: string) => Promise<void>

  // Logo actions
  uploadLogo: (
    accountId: string,
    file: File,
    variant: 'primary' | 'secondary' | 'favicon'
  ) => Promise<string>
  deleteLogo: (accountId: string, variant: 'primary' | 'secondary' | 'favicon') => Promise<void>

  // Extraction
  extractBrandFromUrl: (url: string, accountId: string) => Promise<BrandExtractionResult>
  setExtractionResult: (result: BrandExtractionResult | null) => void
  clearExtractionResult: () => void

  // Document numbering
  getNextDocumentNumber: (accountId: string, documentType: DocumentTypeCode) => Promise<DocumentNumber>
  previewNextNumber: (accountId: string, documentType: DocumentTypeCode) => Promise<string>

  // Utilities
  clearError: () => void
  reset: () => void
}

// ============================================================================
// HELPERS
// ============================================================================

// Map database row to AccountBrandConfig
function mapBrandConfigRow(row: Record<string, unknown>): AccountBrandConfig {
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    brandConfig: row.brand_config as BrandConfig,
    setupCompleted: row.setup_completed as boolean,
    setupCompletedAt: row.setup_completed_at as string | undefined,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string,
    updatedAt: row.updated_at as string,
    updatedBy: row.updated_by as string,
  }
}

// Map database row to AccountTemplate
function mapTemplateRow(row: Record<string, unknown>): AccountTemplate {
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    templateType: row.template_type as TemplateType,
    templateName: row.template_name as string,
    description: row.description as string | undefined,
    storagePath: row.storage_path as string,
    fileSize: row.file_size as number | undefined,
    mimeType: row.mime_type as string,
    isDefault: row.is_default as boolean,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string,
    updatedAt: row.updated_at as string,
    updatedBy: row.updated_by as string,
  }
}

// Format document number
function formatDocumentNumber(prefix: string, typeCode: DocumentTypeCode, sequence: number): string {
  return `${prefix}-${typeCode}-${sequence.toString().padStart(3, '0')}`
}

// ============================================================================
// STORE
// ============================================================================

export const useBrandStore = create<BrandState>()(
  persist(
    (set, get) => ({
      // Initial state
      brandConfig: null,
      templates: [],
      isLoading: false,
      error: null,
      extractionResult: null,
      isExtracting: false,

      // Getters
      hasCompletedSetup: () => {
        return get().brandConfig?.setupCompleted ?? false
      },

      getDefaultTemplate: (type: TemplateType) => {
        return get().templates.find((t) => t.templateType === type && t.isDefault) || null
      },

      // ========================================================================
      // BRAND CONFIG ACTIONS
      // ========================================================================

      fetchBrandConfig: async (accountId: string) => {
        if (!supabase) {
          return null
        }

        set({ isLoading: true, error: null })

        try {
          const { data, error } = await supabase
            .from('account_brand_config')
            .select('*')
            .eq('account_id', accountId)
            .single()

          if (error) {
            // Not found is okay - means no brand config yet
            if (error.code === 'PGRST116') {
              set({ brandConfig: null, isLoading: false })
              return null
            }
            throw error
          }

          const config = mapBrandConfigRow(data)
          set({ brandConfig: config, isLoading: false })
          return config
        } catch (error) {
          if (isAuthError(error)) {
            await handleAuthError()
            return null
          }

          console.error('[BrandStore] Failed to fetch brand config:', error)
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to fetch brand config',
          })
          return null
        }
      },

      saveBrandConfig: async (accountId: string, configUpdates: Partial<BrandConfig>, userId: string) => {
        if (!supabase) {
          return
        }

        set({ isLoading: true, error: null })

        try {
          const { brandConfig: existing } = get()

          // Merge with existing config or defaults
          const mergedConfig: BrandConfig = {
            ...(existing?.brandConfig || {
              companyName: '',
              tagline: '',
              docNumberPrefix: '',
              logos: { primary: null, secondary: null, favicon: null },
              colors: { primary: '#0ea5e9', secondary: '#64748b', accent: '#f59e0b', background: '#ffffff', text: '#0f172a' },
              fonts: { heading: 'Inter', body: 'Inter' },
            }),
            ...configUpdates,
          }

          if (existing) {
            // Update existing
            const { data, error } = await supabase
              .from('account_brand_config')
              .update({
                brand_config: mergedConfig,
                updated_by: userId,
              })
              .eq('id', existing.id)
              .select()
              .single()

            if (error) throw error
            set({ brandConfig: mapBrandConfigRow(data), isLoading: false })
          } else {
            // Insert new
            const { data, error } = await supabase
              .from('account_brand_config')
              .insert({
                account_id: accountId,
                brand_config: mergedConfig,
                created_by: userId,
                updated_by: userId,
              })
              .select()
              .single()

            if (error) throw error
            set({ brandConfig: mapBrandConfigRow(data), isLoading: false })
          }
        } catch (error) {
          if (isAuthError(error)) {
            await handleAuthError()
            return
          }

          console.error('[BrandStore] Failed to save brand config:', error)
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to save brand config',
          })
          throw error
        }
      },

      completeBrandSetup: async (accountId: string, userId: string) => {
        if (!supabase) return

        const { brandConfig } = get()
        if (!brandConfig) return

        set({ isLoading: true, error: null })

        try {
          const { data, error } = await supabase
            .from('account_brand_config')
            .update({
              setup_completed: true,
              setup_completed_at: new Date().toISOString(),
              updated_by: userId,
            })
            .eq('account_id', accountId)
            .select()
            .single()

          if (error) throw error
          set({ brandConfig: mapBrandConfigRow(data), isLoading: false })
        } catch (error) {
          if (isAuthError(error)) {
            await handleAuthError()
            return
          }

          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to complete setup',
          })
          throw error
        }
      },

      resetBrandConfig: async (accountId: string) => {
        if (!supabase) return

        set({ isLoading: true, error: null })

        try {
          await supabase
            .from('account_brand_config')
            .delete()
            .eq('account_id', accountId)

          set({ brandConfig: null, isLoading: false })
        } catch (error) {
          if (isAuthError(error)) {
            await handleAuthError()
            return
          }

          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to reset brand config',
          })
        }
      },

      // ========================================================================
      // TEMPLATE ACTIONS
      // ========================================================================

      fetchTemplates: async (accountId: string) => {
        if (!supabase) return

        set({ isLoading: true, error: null })

        try {
          const { data, error } = await supabase
            .from('account_templates')
            .select('*')
            .eq('account_id', accountId)
            .is('deleted_at', null)
            .order('template_type')
            .order('is_default', { ascending: false })

          if (error) throw error

          set({
            templates: (data || []).map(mapTemplateRow),
            isLoading: false,
          })
        } catch (error) {
          if (isAuthError(error)) {
            await handleAuthError()
            return
          }

          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to fetch templates',
          })
        }
      },

      createTemplate: async (accountId, file, metadata, userId) => {
        if (!supabase) {
          throw new Error('Supabase not configured')
        }

        set({ isLoading: true, error: null })

        try {
          // Generate storage path
          const ext = metadata.type === 'document' ? 'docx' : metadata.type === 'presentation' ? 'pptx' : 'xlsx'
          const fileName = `${metadata.name.toLowerCase().replace(/\s+/g, '-')}.${ext}`
          const storagePath = `${accountId}/templates/${fileName}`

          // Upload to storage
          const { error: uploadError } = await supabase.storage
            .from('brands')
            .upload(storagePath, file, { upsert: true })

          if (uploadError) throw uploadError

          // Determine mime type
          const mimeType =
            metadata.type === 'document'
              ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : metadata.type === 'presentation'
              ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
              : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

          // Check if this should be default (first of its type)
          const existingOfType = get().templates.filter((t) => t.templateType === metadata.type)
          const isDefault = existingOfType.length === 0

          // Create database record
          const { data, error } = await supabase
            .from('account_templates')
            .insert({
              account_id: accountId,
              template_type: metadata.type,
              template_name: metadata.name,
              description: metadata.description,
              storage_path: storagePath,
              file_size: file.size,
              mime_type: mimeType,
              is_default: isDefault,
              created_by: userId,
              updated_by: userId,
            })
            .select()
            .single()

          if (error) throw error

          const template = mapTemplateRow(data)
          set((state) => ({
            templates: [...state.templates, template],
            isLoading: false,
          }))

          return template
        } catch (error) {
          if (isAuthError(error)) {
            await handleAuthError()
            throw error
          }

          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to create template',
          })
          throw error
        }
      },

      deleteTemplate: async (templateId: string) => {
        if (!supabase) return

        set({ isLoading: true, error: null })

        try {
          // Soft delete
          const { error } = await supabase
            .from('account_templates')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', templateId)

          if (error) throw error

          set((state) => ({
            templates: state.templates.filter((t) => t.id !== templateId),
            isLoading: false,
          }))
        } catch (error) {
          if (isAuthError(error)) {
            await handleAuthError()
            return
          }

          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to delete template',
          })
        }
      },

      setDefaultTemplate: async (templateId: string, templateType: TemplateType, accountId: string) => {
        if (!supabase) return

        set({ isLoading: true, error: null })

        try {
          // First, unset all defaults for this type
          await supabase
            .from('account_templates')
            .update({ is_default: false })
            .eq('account_id', accountId)
            .eq('template_type', templateType)

          // Then set the new default
          const { error } = await supabase
            .from('account_templates')
            .update({ is_default: true })
            .eq('id', templateId)

          if (error) throw error

          // Update local state
          set((state) => ({
            templates: state.templates.map((t) => ({
              ...t,
              isDefault: t.id === templateId ? true : t.templateType === templateType ? false : t.isDefault,
            })),
            isLoading: false,
          }))
        } catch (error) {
          if (isAuthError(error)) {
            await handleAuthError()
            return
          }

          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to set default template',
          })
        }
      },

      // ========================================================================
      // LOGO ACTIONS
      // ========================================================================

      uploadLogo: async (accountId, file, variant) => {
        if (!supabase) {
          throw new Error('Supabase not configured')
        }

        try {
          // Get file extension
          const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
          const storagePath = `${accountId}/logos/${variant}.${ext}`

          // Upload to storage
          const { error: uploadError } = await supabase.storage
            .from('brands')
            .upload(storagePath, file, { upsert: true })

          if (uploadError) throw uploadError

          // Get public URL
          const { data: urlData } = supabase.storage.from('brands').getPublicUrl(storagePath)

          return urlData.publicUrl
        } catch (error) {
          if (isAuthError(error)) {
            await handleAuthError()
            throw error
          }

          throw error
        }
      },

      deleteLogo: async (accountId, variant) => {
        if (!supabase) return

        try {
          // List files to find the logo (could have different extensions)
          const { data: files } = await supabase.storage
            .from('brands')
            .list(`${accountId}/logos`, { search: variant })

          if (files && files.length > 0) {
            const filePath = `${accountId}/logos/${files[0].name}`
            await supabase.storage.from('brands').remove([filePath])
          }
        } catch (error) {
          if (isAuthError(error)) {
            await handleAuthError()
            return
          }

          console.error('[BrandStore] Failed to delete logo:', error)
        }
      },

      // ========================================================================
      // EXTRACTION
      // ========================================================================

      extractBrandFromUrl: async (url: string, accountId: string) => {
        if (!supabase) {
          throw new Error('Supabase not configured')
        }

        set({ isExtracting: true, error: null })

        try {
          // Call edge function
          const { data, error } = await supabase.functions.invoke('extract-brand', {
            body: { url, accountId },
          })

          if (error) throw error

          const result = data.result as BrandExtractionResult
          set({ extractionResult: result, isExtracting: false })
          return result
        } catch (error) {
          console.error('[BrandStore] Failed to extract brand:', error)
          set({
            isExtracting: false,
            error: error instanceof Error ? error.message : 'Failed to extract brand',
          })
          throw error
        }
      },

      setExtractionResult: (result) => set({ extractionResult: result }),
      clearExtractionResult: () => set({ extractionResult: null }),

      // ========================================================================
      // DOCUMENT NUMBERING
      // ========================================================================

      getNextDocumentNumber: async (accountId: string, documentType: DocumentTypeCode) => {
        if (!supabase) {
          throw new Error('Supabase not configured')
        }

        try {
          // Call RPC function for atomic increment
          const { data: sequence, error } = await supabase.rpc('get_next_document_number', {
            p_account_id: accountId,
            p_document_type: documentType,
          })

          if (error) throw error

          // Get prefix from brand config
          const { brandConfig } = get()
          const prefix = brandConfig?.brandConfig.docNumberPrefix || 'DOC'
          const year = new Date().getFullYear()

          return {
            prefix,
            typeCode: documentType,
            sequence: sequence as number,
            year,
            formatted: formatDocumentNumber(prefix, documentType, sequence as number),
          }
        } catch (error) {
          if (isAuthError(error)) {
            await handleAuthError()
            throw error
          }

          throw error
        }
      },

      previewNextNumber: async (accountId: string, documentType: DocumentTypeCode) => {
        if (!supabase) {
          return 'DOC-XXX-001'
        }

        try {
          // Get current sequence without incrementing
          const { data, error } = await supabase
            .from('document_sequences')
            .select('last_number')
            .eq('account_id', accountId)
            .eq('document_type', documentType)
            .eq('year', new Date().getFullYear())
            .single()

          const nextNumber = error?.code === 'PGRST116' ? 1 : ((data?.last_number as number) || 0) + 1

          const { brandConfig } = get()
          const prefix = brandConfig?.brandConfig.docNumberPrefix || 'DOC'

          return formatDocumentNumber(prefix, documentType, nextNumber)
        } catch {
          return 'DOC-XXX-001'
        }
      },

      // ========================================================================
      // UTILITIES
      // ========================================================================

      clearError: () => set({ error: null }),

      reset: () =>
        set({
          brandConfig: null,
          templates: [],
          isLoading: false,
          error: null,
          extractionResult: null,
          isExtracting: false,
        }),
    }),
    {
      name: 'agentpm-brand',
      partialize: () => ({
        // Only persist minimal state - brand config is fetched from server
      }),
    }
  )
)
