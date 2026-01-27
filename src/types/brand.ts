// Brand & Templates Types
// TypeScript interfaces for brand configuration, templates, and document numbering

// ============================================================================
// BRAND CONFIGURATION
// ============================================================================

/**
 * Logo URLs for different use cases
 */
export interface BrandLogos {
  /** Primary logo (dark version for light backgrounds) */
  primary: string | null
  /** Secondary/alternate logo (light version for dark backgrounds) */
  secondary: string | null
  /** Favicon/icon for small contexts */
  favicon: string | null
}

/**
 * Brand color palette
 */
export interface BrandColors {
  /** Main brand color (hex) */
  primary: string
  /** Secondary color for accents */
  secondary: string
  /** Accent/highlight color */
  accent: string
  /** Document background color */
  background: string
  /** Primary text color */
  text: string
}

/**
 * Typography settings
 */
export interface BrandFonts {
  /** Font family for headings */
  heading: string
  /** Font family for body text */
  body: string
}

/**
 * Complete brand configuration
 */
export interface BrandConfig {
  /** Company/organization name */
  companyName: string
  /** Tagline or slogan */
  tagline: string
  /** Document number prefix (e.g., "FUN" for "FUN-PRD-001") */
  docNumberPrefix: string
  /** Logo URLs */
  logos: BrandLogos
  /** Color palette */
  colors: BrandColors
  /** Typography settings */
  fonts: BrandFonts
  /** Source URL if extracted from website */
  extractedFromUrl?: string
  /** Timestamp of extraction */
  extractedAt?: string
}

/**
 * Default brand configuration values
 */
export const DEFAULT_BRAND_CONFIG: BrandConfig = {
  companyName: '',
  tagline: '',
  docNumberPrefix: '',
  logos: {
    primary: null,
    secondary: null,
    favicon: null,
  },
  colors: {
    primary: '#0ea5e9',
    secondary: '#64748b',
    accent: '#f59e0b',
    background: '#ffffff',
    text: '#0f172a',
  },
  fonts: {
    heading: 'Inter',
    body: 'Inter',
  },
}

/**
 * Account brand configuration record from database
 */
export interface AccountBrandConfig {
  id: string
  accountId: string
  brandConfig: BrandConfig
  setupCompleted: boolean
  setupCompletedAt?: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

// ============================================================================
// TEMPLATES
// ============================================================================

/**
 * Template types supported by the system
 */
export type TemplateType = 'document' | 'presentation' | 'spreadsheet'

/**
 * Template type metadata
 */
export const TEMPLATE_TYPE_INFO: Record<TemplateType, {
  label: string
  extension: string
  mimeType: string
  icon: string
}> = {
  document: {
    label: 'Document',
    extension: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    icon: 'FileText',
  },
  presentation: {
    label: 'Presentation',
    extension: 'pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    icon: 'Presentation',
  },
  spreadsheet: {
    label: 'Spreadsheet',
    extension: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    icon: 'Table',
  },
}

/**
 * Account template record from database
 */
export interface AccountTemplate {
  id: string
  accountId: string
  templateType: TemplateType
  templateName: string
  description?: string
  storagePath: string
  fileSize?: number
  mimeType: string
  isDefault: boolean
  isActive: boolean
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

// ============================================================================
// DOCUMENT NUMBERING
// ============================================================================

/**
 * Document type codes for numbering
 */
export type DocumentTypeCode = 'PRD' | 'SOW' | 'RPT' | 'PRP' | 'PRS' | 'SHT' | 'DOC'

/**
 * Document type metadata
 */
export const DOCUMENT_TYPE_INFO: Record<DocumentTypeCode, {
  label: string
  fullName: string
  keywords: string[]
}> = {
  PRD: {
    label: 'PRD',
    fullName: 'Product Requirements Document',
    keywords: ['requirements', 'prd', 'spec', 'specification', 'feature'],
  },
  SOW: {
    label: 'SOW',
    fullName: 'Statement of Work',
    keywords: ['statement of work', 'sow', 'scope', 'contract'],
  },
  RPT: {
    label: 'RPT',
    fullName: 'Report',
    keywords: ['report', 'analysis', 'summary', 'findings'],
  },
  PRP: {
    label: 'PRP',
    fullName: 'Proposal',
    keywords: ['proposal', 'quote', 'estimate', 'bid'],
  },
  PRS: {
    label: 'PRS',
    fullName: 'Presentation',
    keywords: ['presentation', 'slides', 'deck'],
  },
  SHT: {
    label: 'SHT',
    fullName: 'Spreadsheet',
    keywords: ['spreadsheet', 'data', 'budget', 'tracker'],
  },
  DOC: {
    label: 'DOC',
    fullName: 'General Document',
    keywords: [],
  },
}

/**
 * Document number details
 */
export interface DocumentNumber {
  /** Account prefix (e.g., "FUN") */
  prefix: string
  /** Document type code */
  typeCode: DocumentTypeCode
  /** Sequential number */
  sequence: number
  /** Year (for yearly sequences) */
  year: number
  /** Full formatted number (e.g., "FUN-PRD-001") */
  formatted: string
}

/**
 * Document sequence record from database
 */
export interface DocumentSequence {
  id: string
  accountId: string
  documentType: DocumentTypeCode
  year: number
  lastNumber: number
  updatedAt: string
}

// ============================================================================
// BRAND EXTRACTION
// ============================================================================

/**
 * Detected logo from website
 */
export interface DetectedLogo {
  /** Original URL of the logo */
  url: string
  /** Classified type */
  type: 'primary' | 'secondary' | 'favicon'
  /** Image width if detected */
  width?: number
  /** Image height if detected */
  height?: number
  /** Uploaded URL after storage */
  uploadedUrl?: string
}

/**
 * Detected color from website
 */
export interface DetectedColor {
  /** Hex color code */
  hex: string
  /** Suggested usage */
  usage: 'primary' | 'secondary' | 'accent' | 'background' | 'text'
  /** Source of detection */
  source: 'css' | 'logo' | 'meta' | 'image'
}

/**
 * Result from brand extraction AI
 */
export interface BrandExtractionResult {
  /** Extracted company name */
  companyName: string
  /** Extracted tagline/slogan */
  tagline?: string
  /** Suggested document number prefix */
  suggestedPrefix: string
  /** Detected logos */
  logos: DetectedLogo[]
  /** Detected colors */
  colors: DetectedColor[]
  /** Detected fonts */
  fonts: string[]
  /** AI confidence score (0-1) */
  confidence: number
  /** Source URL */
  sourceUrl: string
  /** Timestamp */
  extractedAt: string
}

// ============================================================================
// WIZARD STATE
// ============================================================================

/**
 * Brand setup wizard steps
 */
export type BrandWizardStep = 'url-input' | 'extracting' | 'review' | 'templates' | 'complete'

/**
 * Wizard state for brand setup
 */
export interface BrandWizardState {
  /** Current step */
  step: BrandWizardStep
  /** Website URL entered by user */
  websiteUrl: string
  /** Extraction result from AI */
  extractionResult: BrandExtractionResult | null
  /** User-modified brand config */
  brandConfig: Partial<BrandConfig>
  /** Selected template types to generate */
  selectedTemplateTypes: TemplateType[]
  /** Error message if any */
  error: string | null
}

// ============================================================================
// API TYPES
// ============================================================================

/**
 * Request to extract brand from URL
 */
export interface ExtractBrandRequest {
  url: string
  accountId: string
}

/**
 * Request to generate document
 */
export interface GenerateDocumentRequest {
  accountId: string
  title: string
  content: string
  templateType: TemplateType
  documentType?: DocumentTypeCode
  autoDetectType?: boolean
}

/**
 * Response from document generation
 */
export interface GenerateDocumentResponse {
  success: boolean
  documentNumber: string
  downloadUrl: string
  fileName: string
  fileSize: number
}
