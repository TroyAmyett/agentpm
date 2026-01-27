// Brand Setup Wizard
// Multi-step wizard for configuring brand identity and generating templates

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Globe,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  Upload,
  X,
  FileText,
  Presentation,
  Table,
  Sparkles,
} from 'lucide-react'
import { useBrandStore } from '@/stores/brandStore'
import { useAccountStore } from '@/stores/accountStore'
import { useAuthStore } from '@/stores/authStore'
import type { BrandConfig, TemplateType, BrandExtractionResult } from '@/types/brand'
import { TEMPLATE_TYPE_INFO } from '@/types/brand'
import { generateAllTemplates, uploadTemplates } from '@/services/brand'

interface BrandSetupWizardProps {
  onComplete: () => void
  onCancel: () => void
}

type WizardStep = 'url-input' | 'review' | 'templates' | 'complete'

export function BrandSetupWizard({ onComplete, onCancel }: BrandSetupWizardProps) {
  const { user } = useAuthStore()
  const { currentAccountId } = useAccountStore()
  const {
    brandConfig,
    extractionResult,
    isExtracting,
    extractBrandFromUrl,
    saveBrandConfig,
    completeBrandSetup,
    clearExtractionResult,
    fetchTemplates,
  } = useBrandStore()

  const [step, setStep] = useState<WizardStep>('url-input')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Editable brand config (merged from extraction + manual edits)
  const [editableConfig, setEditableConfig] = useState<Partial<BrandConfig>>({
    companyName: '',
    tagline: '',
    docNumberPrefix: '',
    logos: { primary: null, secondary: null, favicon: null },
    colors: { primary: '#0ea5e9', secondary: '#64748b', accent: '#f59e0b', background: '#ffffff', text: '#0f172a' },
    fonts: { heading: 'Inter', body: 'Inter' },
  })

  // Selected template types to generate
  const [selectedTemplates, setSelectedTemplates] = useState<TemplateType[]>(['document', 'presentation', 'spreadsheet'])

  // Handle URL extraction
  const handleExtract = useCallback(async () => {
    if (!websiteUrl || !currentAccountId) return

    setError(null)

    try {
      const result = await extractBrandFromUrl(websiteUrl, currentAccountId)

      // Populate editable config from extraction result
      setEditableConfig({
        companyName: result.companyName || '',
        tagline: result.tagline || '',
        docNumberPrefix: result.suggestedPrefix || '',
        logos: {
          primary: result.logos.find((l) => l.type === 'primary')?.uploadedUrl || null,
          secondary: result.logos.find((l) => l.type === 'secondary')?.uploadedUrl || null,
          favicon: result.logos.find((l) => l.type === 'favicon')?.uploadedUrl || null,
        },
        colors: {
          primary: result.colors.find((c) => c.usage === 'primary')?.hex || '#0ea5e9',
          secondary: result.colors.find((c) => c.usage === 'secondary')?.hex || '#64748b',
          accent: result.colors.find((c) => c.usage === 'accent')?.hex || '#f59e0b',
          background: '#ffffff',
          text: '#0f172a',
        },
        fonts: { heading: 'Inter', body: 'Inter' },
        extractedFromUrl: websiteUrl,
        extractedAt: new Date().toISOString(),
      })

      setStep('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract brand from website')
    }
  }, [websiteUrl, currentAccountId, extractBrandFromUrl])

  // Handle skip to manual setup
  const handleSkipToManual = useCallback(() => {
    clearExtractionResult()
    setStep('review')
  }, [clearExtractionResult])

  // Handle save and continue
  const handleSaveAndContinue = useCallback(async () => {
    if (!currentAccountId || !user?.id) return

    setError(null)
    setIsSaving(true)

    try {
      await saveBrandConfig(currentAccountId, editableConfig as BrandConfig, user.id)
      setStep('templates')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save brand configuration')
    } finally {
      setIsSaving(false)
    }
  }, [currentAccountId, user?.id, editableConfig, saveBrandConfig])

  // Handle template generation and complete
  const handleGenerateAndComplete = useCallback(async () => {
    if (!currentAccountId || !user?.id) return

    setError(null)
    setIsSaving(true)

    try {
      // Get the brand config to use for generation (from saved config or editable)
      const configToUse = brandConfig?.brandConfig || editableConfig as BrandConfig

      // Generate templates for selected types
      if (selectedTemplates.length > 0) {
        const generatedTemplates = await generateAllTemplates(configToUse, selectedTemplates)

        // Upload generated templates to storage
        await uploadTemplates(generatedTemplates, currentAccountId, user.id)
      }

      // Mark setup as complete
      await completeBrandSetup(currentAccountId, user.id)

      // Refresh templates list
      await fetchTemplates(currentAccountId)

      setStep('complete')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate templates')
    } finally {
      setIsSaving(false)
    }
  }, [currentAccountId, user?.id, selectedTemplates, brandConfig, editableConfig, completeBrandSetup, fetchTemplates])

  // Update config field
  const updateConfig = useCallback((field: string, value: unknown) => {
    setEditableConfig((prev) => {
      if (field.includes('.')) {
        const [parent, child] = field.split('.')
        const parentValue = prev[parent as keyof BrandConfig]
        return {
          ...prev,
          [parent]: {
            ...(typeof parentValue === 'object' && parentValue !== null ? parentValue : {}),
            [child]: value,
          },
        }
      }
      return { ...prev, [field]: value }
    })
  }, [])

  return (
    <div
      className="p-6 rounded-xl"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid var(--fl-color-border)',
      }}
    >
      {/* Progress indicator */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          {(['url-input', 'review', 'templates', 'complete'] as WizardStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  step === s
                    ? 'bg-primary-500 text-white'
                    : ['review', 'templates', 'complete'].indexOf(step) > ['url-input', 'review', 'templates', 'complete'].indexOf(s)
                    ? 'bg-green-500 text-white'
                    : ''
                }`}
                style={{
                  background:
                    step === s
                      ? '#0ea5e9'
                      : ['review', 'templates', 'complete'].indexOf(step) > i
                      ? '#22c55e'
                      : 'rgba(255,255,255,0.1)',
                  color: step === s || ['review', 'templates', 'complete'].indexOf(step) > i ? 'white' : 'var(--fl-color-text-muted)',
                }}
              >
                {['review', 'templates', 'complete'].indexOf(step) > i ? <Check size={14} /> : i + 1}
              </div>
              {i < 3 && (
                <div
                  className="w-8 h-0.5"
                  style={{
                    background:
                      ['review', 'templates', 'complete'].indexOf(step) > i
                        ? '#22c55e'
                        : 'rgba(255,255,255,0.1)',
                  }}
                />
              )}
            </div>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          style={{ color: 'var(--fl-color-text-muted)' }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg mb-4"
          style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}
        >
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {step === 'url-input' && (
            <UrlInputStep
              url={websiteUrl}
              onUrlChange={setWebsiteUrl}
              onExtract={handleExtract}
              onSkip={handleSkipToManual}
              isExtracting={isExtracting}
            />
          )}

          {step === 'review' && (
            <ReviewStep
              config={editableConfig}
              extractionResult={extractionResult}
              onUpdateConfig={updateConfig}
              onBack={() => setStep('url-input')}
              onContinue={handleSaveAndContinue}
              isSaving={isSaving}
            />
          )}

          {step === 'templates' && (
            <TemplatesStep
              selectedTemplates={selectedTemplates}
              onToggleTemplate={(type) =>
                setSelectedTemplates((prev) =>
                  prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
                )
              }
              onBack={() => setStep('review')}
              onGenerate={handleGenerateAndComplete}
              isSaving={isSaving}
            />
          )}

          {step === 'complete' && <CompleteStep onFinish={onComplete} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ============================================================================
// STEP COMPONENTS
// ============================================================================

function UrlInputStep({
  url,
  onUrlChange,
  onExtract,
  onSkip,
  isExtracting,
}: {
  url: string
  onUrlChange: (url: string) => void
  onExtract: () => void
  onSkip: () => void
  isExtracting: boolean
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--fl-color-text-primary)' }}>
          Extract Brand from Website
        </h3>
        <p className="text-sm" style={{ color: 'var(--fl-color-text-muted)' }}>
          Enter your website URL and we'll automatically extract your logo, colors, and company information.
        </p>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
            Website URL
          </span>
          <div className="relative mt-1">
            <Globe
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--fl-color-text-muted)' }}
            />
            <input
              type="url"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://example.com"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--fl-color-border)',
                color: 'var(--fl-color-text-primary)',
              }}
              disabled={isExtracting}
            />
          </div>
        </label>

        <button
          onClick={onExtract}
          disabled={!url || isExtracting}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: '#0ea5e9',
            color: 'white',
          }}
        >
          {isExtracting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Extracting brand...
            </>
          ) : (
            <>
              <Sparkles size={18} />
              Extract Brand
            </>
          )}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: 'var(--fl-color-border)' }} />
        <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
          or
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--fl-color-border)' }} />
      </div>

      <button
        onClick={onSkip}
        disabled={isExtracting}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors hover:bg-white/10"
        style={{
          border: '1px solid var(--fl-color-border)',
          color: 'var(--fl-color-text-secondary)',
        }}
      >
        Set up manually
        <ArrowRight size={18} />
      </button>
    </div>
  )
}

function ReviewStep({
  config,
  extractionResult,
  onUpdateConfig,
  onBack,
  onContinue,
  isSaving,
}: {
  config: Partial<BrandConfig>
  extractionResult: BrandExtractionResult | null
  onUpdateConfig: (field: string, value: unknown) => void
  onBack: () => void
  onContinue: () => void
  isSaving: boolean
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--fl-color-text-primary)' }}>
          Review & Adjust
        </h3>
        <p className="text-sm" style={{ color: 'var(--fl-color-text-muted)' }}>
          {extractionResult
            ? `We extracted brand information from ${extractionResult.sourceUrl}. Adjust as needed.`
            : 'Enter your brand information manually.'}
        </p>
        {extractionResult && (
          <div className="mt-2 flex items-center gap-1">
            <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
              Confidence:
            </span>
            <span
              className="text-xs font-medium"
              style={{ color: extractionResult.confidence > 0.7 ? '#22c55e' : '#f59e0b' }}
            >
              {Math.round(extractionResult.confidence * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Company Info */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
          Company Information
        </h4>

        <label className="block">
          <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
            Company Name <span className="text-red-400">*</span>
          </span>
          <input
            type="text"
            value={config.companyName || ''}
            onChange={(e) => onUpdateConfig('companyName', e.target.value)}
            placeholder="Your Company"
            className="w-full px-3 py-2 rounded-lg text-sm mt-1"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--fl-color-border)',
              color: 'var(--fl-color-text-primary)',
            }}
          />
        </label>

        <label className="block">
          <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
            Tagline
          </span>
          <input
            type="text"
            value={config.tagline || ''}
            onChange={(e) => onUpdateConfig('tagline', e.target.value)}
            placeholder="Your company tagline"
            className="w-full px-3 py-2 rounded-lg text-sm mt-1"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--fl-color-border)',
              color: 'var(--fl-color-text-primary)',
            }}
          />
        </label>

        <label className="block">
          <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
            Document Number Prefix (3-5 characters)
          </span>
          <input
            type="text"
            value={config.docNumberPrefix || ''}
            onChange={(e) => onUpdateConfig('docNumberPrefix', e.target.value.toUpperCase().slice(0, 5))}
            placeholder="DOC"
            maxLength={5}
            className="w-full px-3 py-2 rounded-lg text-sm mt-1 font-mono"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--fl-color-border)',
              color: 'var(--fl-color-text-primary)',
            }}
          />
          <span className="text-xs mt-1 block" style={{ color: 'var(--fl-color-text-muted)' }}>
            Example: {config.docNumberPrefix || 'DOC'}-PRD-001
          </span>
        </label>
      </div>

      {/* Colors */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
          Brand Colors
        </h4>
        <div className="grid grid-cols-3 gap-3">
          <ColorInput
            label="Primary"
            value={config.colors?.primary || '#0ea5e9'}
            onChange={(v) => onUpdateConfig('colors.primary', v)}
          />
          <ColorInput
            label="Secondary"
            value={config.colors?.secondary || '#64748b'}
            onChange={(v) => onUpdateConfig('colors.secondary', v)}
          />
          <ColorInput
            label="Accent"
            value={config.colors?.accent || '#f59e0b'}
            onChange={(v) => onUpdateConfig('colors.accent', v)}
          />
        </div>
      </div>

      {/* Logo section */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
          Logos
        </h4>

        {/* Show warning if logo is for dark backgrounds */}
        {extractionResult?.logoDesignedForDarkBackground && !config.logos?.secondary && (
          <div
            className="flex items-start gap-2 p-3 rounded-lg text-sm"
            style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}
          >
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium">Logo designed for dark backgrounds</div>
              <div className="text-xs mt-1 opacity-80">
                Consider uploading an alternate logo for light backgrounds (documents, presentations).
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {/* Primary logo - for dark backgrounds */}
          <div>
            <div className="text-xs mb-2" style={{ color: 'var(--fl-color-text-muted)' }}>
              {extractionResult?.logoDesignedForDarkBackground ? 'Logo (for dark backgrounds)' : 'Primary Logo'}
            </div>
            <div
              className="h-20 rounded-lg flex items-center justify-center p-2 relative group"
              style={{ background: extractionResult?.logoDesignedForDarkBackground ? '#1e293b' : 'white' }}
            >
              {config.logos?.primary ? (
                <img
                  src={config.logos.primary}
                  alt="Primary logo"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>No logo</span>
              )}
            </div>
            <button
              className="text-xs px-2 py-1 mt-1 rounded hover:bg-white/10 w-full text-center"
              style={{ color: 'var(--fl-color-text-muted)' }}
            >
              <Upload size={12} className="inline mr-1" />
              Upload
            </button>
          </div>

          {/* Secondary logo - for light backgrounds */}
          <div>
            <div className="text-xs mb-2" style={{ color: 'var(--fl-color-text-muted)' }}>
              {extractionResult?.logoDesignedForDarkBackground ? 'Logo (for light backgrounds)' : 'Alternate Logo'}
            </div>
            <div
              className="h-20 rounded-lg flex items-center justify-center p-2 relative group"
              style={{ background: extractionResult?.logoDesignedForDarkBackground ? 'white' : '#1e293b' }}
            >
              {config.logos?.secondary ? (
                <img
                  src={config.logos.secondary}
                  alt="Secondary logo"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-xs" style={{ color: extractionResult?.logoDesignedForDarkBackground ? '#94a3b8' : 'var(--fl-color-text-muted)' }}>
                  {extractionResult?.logoDesignedForDarkBackground ? 'Upload for documents' : 'Optional'}
                </span>
              )}
            </div>
            <button
              className="text-xs px-2 py-1 mt-1 rounded hover:bg-white/10 w-full text-center"
              style={{ color: extractionResult?.logoDesignedForDarkBackground && !config.logos?.secondary ? '#f59e0b' : 'var(--fl-color-text-muted)' }}
            >
              <Upload size={12} className="inline mr-1" />
              Upload
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors hover:bg-white/10"
          style={{ color: 'var(--fl-color-text-secondary)' }}
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <button
          onClick={onContinue}
          disabled={!config.companyName || isSaving}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: '#0ea5e9',
            color: 'white',
          }}
        >
          {isSaving ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              Continue
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function TemplatesStep({
  selectedTemplates,
  onToggleTemplate,
  onBack,
  onGenerate,
  isSaving,
}: {
  selectedTemplates: TemplateType[]
  onToggleTemplate: (type: TemplateType) => void
  onBack: () => void
  onGenerate: () => void
  isSaving: boolean
}) {
  const templateTypes: { type: TemplateType; icon: typeof FileText }[] = [
    { type: 'document', icon: FileText },
    { type: 'presentation', icon: Presentation },
    { type: 'spreadsheet', icon: Table },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--fl-color-text-primary)' }}>
          Generate Templates
        </h3>
        <p className="text-sm" style={{ color: 'var(--fl-color-text-muted)' }}>
          Select which template types to generate with your brand styling.
        </p>
      </div>

      <div className="space-y-3">
        {templateTypes.map(({ type, icon: Icon }) => {
          const info = TEMPLATE_TYPE_INFO[type]
          const isSelected = selectedTemplates.includes(type)

          return (
            <button
              key={type}
              onClick={() => onToggleTemplate(type)}
              className="w-full flex items-center gap-3 p-4 rounded-lg transition-colors text-left"
              style={{
                background: isSelected ? 'rgba(14, 165, 233, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${isSelected ? '#0ea5e9' : 'var(--fl-color-border)'}`,
              }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(255, 255, 255, 0.1)' }}
              >
                <Icon size={20} style={{ color: isSelected ? '#0ea5e9' : 'var(--fl-color-text-muted)' }} />
              </div>
              <div className="flex-1">
                <div className="font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
                  {info.label} Template
                </div>
                <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                  .{info.extension} - {info.mimeType.split('.').pop()}
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded border flex items-center justify-center ${
                  isSelected ? 'bg-primary-500 border-primary-500' : ''
                }`}
                style={{ borderColor: isSelected ? '#0ea5e9' : 'var(--fl-color-border)' }}
              >
                {isSelected && <Check size={14} className="text-white" />}
              </div>
            </button>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors hover:bg-white/10"
          style={{ color: 'var(--fl-color-text-secondary)' }}
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <button
          onClick={onGenerate}
          disabled={selectedTemplates.length === 0 || isSaving}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: '#0ea5e9',
            color: 'white',
          }}
        >
          {isSaving ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles size={18} />
              Generate Templates
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function CompleteStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="text-center py-8">
      <div
        className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(34, 197, 94, 0.15)' }}
      >
        <Check size={32} className="text-green-500" />
      </div>
      <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--fl-color-text-primary)' }}>
        Brand Setup Complete!
      </h3>
      <p className="text-sm mb-6" style={{ color: 'var(--fl-color-text-muted)' }}>
        Your brand templates are ready. Documents created from now on will use your brand styling.
      </p>
      <button
        onClick={onFinish}
        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-colors"
        style={{
          background: '#0ea5e9',
          color: 'white',
        }}
      >
        Done
        <Check size={18} />
      </button>
    </div>
  )
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
        {label}
      </span>
      <div className="flex items-center gap-2 mt-1">
        <div
          className="w-8 h-8 rounded-lg border cursor-pointer"
          style={{ backgroundColor: value, borderColor: 'var(--fl-color-border)' }}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="opacity-0 w-full h-full cursor-pointer"
          />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 px-2 py-1.5 rounded text-xs font-mono"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--fl-color-border)',
            color: 'var(--fl-color-text-primary)',
          }}
        />
      </div>
    </label>
  )
}
