// Brand & Templates Settings
// Main container for brand configuration and document templates

import { useState, useEffect } from 'react'
import {
  Palette,
  Globe,
  FileText,
  Presentation,
  Table,
  RefreshCw,
  AlertCircle,
  Loader2,
  Edit2,
} from 'lucide-react'
import { useBrandStore } from '@/stores/brandStore'
import { useAccountStore } from '@/stores/accountStore'
import { BrandSetupWizard } from './BrandSetupWizard'
import type { TemplateType, DocumentTypeCode } from '@/types/brand'
import { TEMPLATE_TYPE_INFO } from '@/types/brand'

export function BrandTemplatesSettings() {
  const { currentAccountId } = useAccountStore()
  const {
    brandConfig,
    isLoading,
    error,
    fetchBrandConfig,
    fetchTemplates,
    hasCompletedSetup,
    clearError,
  } = useBrandStore()

  const [showWizard, setShowWizard] = useState(false)

  // Fetch brand config and templates on mount
  useEffect(() => {
    if (currentAccountId) {
      fetchBrandConfig(currentAccountId)
      fetchTemplates(currentAccountId)
    }
  }, [currentAccountId, fetchBrandConfig, fetchTemplates])

  // Show wizard if setup not completed
  const setupCompleted = hasCompletedSetup()

  if (isLoading && !brandConfig) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin" size={24} style={{ color: 'var(--fl-color-text-muted)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-lg font-medium flex items-center gap-2"
            style={{ color: 'var(--fl-color-text-primary)' }}
          >
            <Palette size={20} />
            Brand & Templates
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--fl-color-text-muted)' }}>
            Configure your brand identity and document templates
          </p>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg"
          style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}
        >
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
          <button onClick={clearError} className="ml-auto text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Content */}
      {!setupCompleted && !showWizard ? (
        <EmptyState onSetup={() => setShowWizard(true)} />
      ) : showWizard ? (
        <BrandSetupWizard
          onComplete={() => setShowWizard(false)}
          onCancel={() => setShowWizard(false)}
        />
      ) : (
        <BrandOverview onEditBrand={() => setShowWizard(true)} />
      )}
    </div>
  )
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function EmptyState({ onSetup }: { onSetup: () => void }) {
  return (
    <div
      className="p-8 rounded-xl text-center"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid var(--fl-color-border)',
      }}
    >
      <div
        className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(14, 165, 233, 0.15)' }}
      >
        <Palette size={32} className="text-primary-500" />
      </div>
      <h3
        className="text-lg font-medium mb-2"
        style={{ color: 'var(--fl-color-text-primary)' }}
      >
        No brand templates configured
      </h3>
      <p
        className="text-sm mb-6 max-w-md mx-auto"
        style={{ color: 'var(--fl-color-text-muted)' }}
      >
        Set up your brand to generate professional documents, presentations, and spreadsheets
        with your logo and colors.
      </p>
      <button
        onClick={onSetup}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors"
        style={{
          background: '#0ea5e9',
          color: 'white',
        }}
      >
        <Globe size={18} />
        Set Up Brand from Website
      </button>
      <p className="text-xs mt-3" style={{ color: 'var(--fl-color-text-muted)' }}>
        or{' '}
        <button onClick={onSetup} className="underline hover:no-underline">
          set up manually
        </button>
      </p>
    </div>
  )
}

// ============================================================================
// BRAND OVERVIEW (Configured State)
// ============================================================================

function BrandOverview({ onEditBrand }: { onEditBrand: () => void }) {
  const { brandConfig, templates } = useBrandStore()
  const config = brandConfig?.brandConfig

  if (!config) return null

  return (
    <div className="space-y-6">
      {/* Brand Identity Card */}
      <div
        className="p-4 rounded-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--fl-color-border)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
            Brand Identity
          </h3>
          <button
            onClick={onEditBrand}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: 'var(--fl-color-text-muted)' }}
          >
            <Edit2 size={12} />
            Edit
          </button>
        </div>

        <div className="space-y-4">
          {/* Company Name & Tagline */}
          <div>
            <div className="text-lg font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
              {config.companyName || 'Company Name'}
            </div>
            {config.tagline && (
              <div className="text-sm" style={{ color: 'var(--fl-color-text-muted)' }}>
                {config.tagline}
              </div>
            )}
          </div>

          {/* Logos */}
          <div className="flex items-center gap-4">
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--fl-color-text-muted)' }}>
                Primary Logo
              </div>
              {config.logos.primary ? (
                <img
                  src={config.logos.primary}
                  alt="Primary logo"
                  className="h-12 max-w-[150px] object-contain rounded"
                  style={{ background: 'white', padding: '4px' }}
                />
              ) : (
                <div
                  className="h-12 w-24 rounded flex items-center justify-center text-xs"
                  style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--fl-color-text-muted)' }}
                >
                  No logo
                </div>
              )}
            </div>
            {config.logos.secondary && (
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--fl-color-text-muted)' }}>
                  Secondary Logo
                </div>
                <img
                  src={config.logos.secondary}
                  alt="Secondary logo"
                  className="h-12 max-w-[150px] object-contain rounded"
                  style={{ background: '#1e293b', padding: '4px' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Colors Card */}
      <div
        className="p-4 rounded-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--fl-color-border)',
        }}
      >
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--fl-color-text-primary)' }}>
          Brand Colors
        </h3>
        <div className="flex items-center gap-4 flex-wrap">
          <ColorSwatch label="Primary" color={config.colors.primary} />
          <ColorSwatch label="Secondary" color={config.colors.secondary} />
          <ColorSwatch label="Accent" color={config.colors.accent} />
        </div>
      </div>

      {/* Document Numbering Card */}
      <div
        className="p-4 rounded-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--fl-color-border)',
        }}
      >
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--fl-color-text-primary)' }}>
          Document Numbering
        </h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
              Prefix:
            </span>
            <span
              className="px-2 py-0.5 rounded text-sm font-mono"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--fl-color-text-primary)' }}
            >
              {config.docNumberPrefix || 'DOC'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
              Examples:
            </span>
            {(['PRD', 'SOW', 'RPT'] as DocumentTypeCode[]).map((type) => (
              <span
                key={type}
                className="px-2 py-0.5 rounded text-xs font-mono"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--fl-color-text-secondary)' }}
              >
                {config.docNumberPrefix || 'DOC'}-{type}-001
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Templates Card */}
      <div
        className="p-4 rounded-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--fl-color-border)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
            Templates
          </h3>
          <button
            className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: 'var(--fl-color-text-muted)' }}
          >
            <RefreshCw size={12} />
            Regenerate All
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['document', 'presentation', 'spreadsheet'] as TemplateType[]).map((type) => {
            const template = templates.find((t) => t.templateType === type && t.isDefault)
            const info = TEMPLATE_TYPE_INFO[type]
            const Icon = type === 'document' ? FileText : type === 'presentation' ? Presentation : Table

            return (
              <div
                key={type}
                className="p-3 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.05)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={16} style={{ color: 'var(--fl-color-text-muted)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--fl-color-text-primary)' }}>
                    {info.label}
                  </span>
                </div>
                {template ? (
                  <div className="space-y-2">
                    <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                      {template.templateName}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
                        style={{ color: '#0ea5e9' }}
                      >
                        Preview
                      </button>
                      <button
                        className="text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
                        style={{ color: 'var(--fl-color-text-muted)' }}
                      >
                        Download
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
                    No template generated
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function ColorSwatch({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-8 h-8 rounded-lg border"
        style={{ backgroundColor: color, borderColor: 'var(--fl-color-border)' }}
      />
      <div>
        <div className="text-xs" style={{ color: 'var(--fl-color-text-muted)' }}>
          {label}
        </div>
        <div className="text-xs font-mono" style={{ color: 'var(--fl-color-text-secondary)' }}>
          {color}
        </div>
      </div>
    </div>
  )
}
