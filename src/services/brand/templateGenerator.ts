// Template Generator Service
// Generates branded document templates (docx, pptx, xlsx) from brand configuration

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Header,
  Footer,
  PageNumber,
  AlignmentType,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
} from 'docx'
import PptxGenJS from 'pptxgenjs'
import ExcelJS from 'exceljs'
import type { BrandConfig, TemplateType } from '@/types/brand'
import { supabase } from '@/services/supabase/client'

// ============================================================================
// TYPES
// ============================================================================

interface GeneratedTemplate {
  blob: Blob
  fileName: string
  mimeType: string
  templateType: TemplateType
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

/**
 * Generate all templates for a brand configuration
 */
export async function generateAllTemplates(
  brand: BrandConfig,
  types: TemplateType[] = ['document', 'presentation', 'spreadsheet']
): Promise<GeneratedTemplate[]> {
  const templates: GeneratedTemplate[] = []

  for (const type of types) {
    try {
      const template = await generateTemplate(brand, type)
      templates.push(template)
    } catch (error) {
      console.error(`[TemplateGenerator] Failed to generate ${type} template:`, error)
    }
  }

  return templates
}

/**
 * Generate a single template by type
 */
export async function generateTemplate(
  brand: BrandConfig,
  type: TemplateType
): Promise<GeneratedTemplate> {
  switch (type) {
    case 'document':
      return generateWordTemplate(brand)
    case 'presentation':
      return generatePptxTemplate(brand)
    case 'spreadsheet':
      return generateXlsxTemplate(brand)
    default:
      throw new Error(`Unknown template type: ${type}`)
  }
}

// ============================================================================
// WORD DOCUMENT TEMPLATE
// ============================================================================

async function generateWordTemplate(brand: BrandConfig): Promise<GeneratedTemplate> {
  const primaryColor = brand.colors.primary.replace('#', '')
  const secondaryColor = brand.colors.secondary.replace('#', '')

  const doc = new Document({
    creator: brand.companyName,
    title: `${brand.companyName} Document Template`,
    description: 'Branded document template',
    styles: {
      default: {
        document: {
          run: {
            font: brand.fonts.body || 'Arial',
            size: 24, // 12pt = 24 half-points
          },
        },
        heading1: {
          run: {
            font: brand.fonts.heading || 'Arial',
            size: 48, // 24pt
            bold: true,
            color: primaryColor,
          },
          paragraph: {
            spacing: { before: 240, after: 120 },
          },
        },
        heading2: {
          run: {
            font: brand.fonts.heading || 'Arial',
            size: 36, // 18pt
            bold: true,
            color: primaryColor,
          },
          paragraph: {
            spacing: { before: 200, after: 80 },
          },
        },
        heading3: {
          run: {
            font: brand.fonts.heading || 'Arial',
            size: 28, // 14pt
            bold: true,
            color: secondaryColor,
          },
          paragraph: {
            spacing: { before: 160, after: 60 },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch = 1440 twips
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: brand.companyName,
                    bold: true,
                    color: primaryColor,
                    size: 20,
                  }),
                  new TextRun({
                    text: brand.tagline ? `  |  ${brand.tagline}` : '',
                    color: secondaryColor,
                    size: 18,
                    italics: true,
                  }),
                ],
                alignment: AlignmentType.LEFT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Document #: ${brand.docNumberPrefix || 'DOC'}-XXX-000`,
                    color: secondaryColor,
                    size: 18,
                  }),
                  new TextRun({
                    text: '    |    Page ',
                    color: secondaryColor,
                    size: 18,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                  }),
                  new TextRun({
                    text: ' of ',
                    color: secondaryColor,
                    size: 18,
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 18,
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: [
          // Title placeholder
          new Paragraph({
            text: '[Document Title]',
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 200 },
            style: 'heading1',
          }),

          // Document info table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ text: 'Document Number:', style: 'Normal' })],
                    width: { size: 30, type: WidthType.PERCENTAGE },
                    shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
                  }),
                  new TableCell({
                    children: [new Paragraph({ text: `${brand.docNumberPrefix || 'DOC'}-XXX-000` })],
                    width: { size: 70, type: WidthType.PERCENTAGE },
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ text: 'Version:' })],
                    shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
                  }),
                  new TableCell({
                    children: [new Paragraph({ text: '1.0' })],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ text: 'Date:' })],
                    shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
                  }),
                  new TableCell({
                    children: [new Paragraph({ text: new Date().toLocaleDateString() })],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ text: 'Author:' })],
                    shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
                  }),
                  new TableCell({
                    children: [new Paragraph({ text: '[Author Name]' })],
                  }),
                ],
              }),
            ],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
              left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
              right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
              insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
            },
          }),

          // Spacing
          new Paragraph({ text: '', spacing: { before: 400, after: 400 } }),

          // Section 1
          new Paragraph({
            text: '1. Executive Summary',
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            text: '[Enter executive summary here. This section should provide a brief overview of the document contents.]',
            spacing: { before: 120, after: 200 },
          }),

          // Section 2
          new Paragraph({
            text: '2. Introduction',
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            text: '[Enter introduction here.]',
            spacing: { before: 120, after: 200 },
          }),

          // Section 3
          new Paragraph({
            text: '3. Details',
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            text: '3.1 Subsection',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            text: '[Enter details here.]',
            spacing: { before: 120, after: 200 },
          }),

          // Section 4
          new Paragraph({
            text: '4. Conclusion',
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            text: '[Enter conclusion here.]',
            spacing: { before: 120, after: 200 },
          }),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const prefix = brand.companyName.toLowerCase().replace(/\s+/g, '-')

  return {
    blob,
    fileName: `${prefix}-document-template.docx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    templateType: 'document',
  }
}

// ============================================================================
// POWERPOINT TEMPLATE
// ============================================================================

async function generatePptxTemplate(brand: BrandConfig): Promise<GeneratedTemplate> {
  const pptx = new PptxGenJS()

  // Set presentation properties
  pptx.author = brand.companyName
  pptx.title = `${brand.companyName} Presentation Template`
  pptx.subject = 'Branded presentation template'
  pptx.company = brand.companyName

  // Define colors (remove # prefix)
  const primaryColor = brand.colors.primary.replace('#', '')
  const secondaryColor = brand.colors.secondary.replace('#', '')
  const accentColor = brand.colors.accent.replace('#', '')

  // Define master slide
  pptx.defineSlideMaster({
    title: 'BRAND_MASTER',
    background: { color: 'FFFFFF' },
    objects: [
      // Footer bar
      {
        rect: {
          x: 0,
          y: 5.2,
          w: '100%',
          h: 0.3,
          fill: { color: primaryColor },
        },
      },
      // Company name in footer
      {
        text: {
          text: brand.companyName,
          options: {
            x: 0.5,
            y: 5.25,
            w: 4,
            h: 0.25,
            fontSize: 10,
            color: 'FFFFFF',
            fontFace: brand.fonts.body || 'Arial',
          },
        },
      },
      // Page number
      {
        text: {
          text: 'Slide ',
          options: {
            x: 8.5,
            y: 5.25,
            w: 1,
            h: 0.25,
            fontSize: 10,
            color: 'FFFFFF',
            fontFace: brand.fonts.body || 'Arial',
            align: 'right',
          },
        },
      },
    ],
  })

  // Slide 1: Title Slide
  const slide1 = pptx.addSlide({ masterName: 'BRAND_MASTER' })

  // Background accent bar
  slide1.addShape('rect', {
    x: 0,
    y: 0,
    w: '100%',
    h: 0.15,
    fill: { color: primaryColor },
  })

  // Title
  slide1.addText('[Presentation Title]', {
    x: 0.5,
    y: 2,
    w: 9,
    h: 1,
    fontSize: 44,
    bold: true,
    color: primaryColor,
    fontFace: brand.fonts.heading || 'Arial',
  })

  // Subtitle/tagline
  slide1.addText(brand.tagline || '[Subtitle or tagline]', {
    x: 0.5,
    y: 3,
    w: 9,
    h: 0.5,
    fontSize: 20,
    color: secondaryColor,
    fontFace: brand.fonts.body || 'Arial',
  })

  // Date
  slide1.addText(new Date().toLocaleDateString(), {
    x: 0.5,
    y: 4,
    w: 9,
    h: 0.4,
    fontSize: 14,
    color: '666666',
    fontFace: brand.fonts.body || 'Arial',
  })

  // Slide 2: Section Header
  const slide2 = pptx.addSlide({ masterName: 'BRAND_MASTER' })

  slide2.addShape('rect', {
    x: 0,
    y: 0,
    w: '100%',
    h: 2.5,
    fill: { color: primaryColor },
  })

  slide2.addText('[Section Title]', {
    x: 0.5,
    y: 0.8,
    w: 9,
    h: 1,
    fontSize: 40,
    bold: true,
    color: 'FFFFFF',
    fontFace: brand.fonts.heading || 'Arial',
  })

  slide2.addText('[Section subtitle or description]', {
    x: 0.5,
    y: 2.8,
    w: 9,
    h: 0.5,
    fontSize: 18,
    color: secondaryColor,
    fontFace: brand.fonts.body || 'Arial',
  })

  // Slide 3: Content Slide
  const slide3 = pptx.addSlide({ masterName: 'BRAND_MASTER' })

  slide3.addText('[Slide Title]', {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.8,
    fontSize: 32,
    bold: true,
    color: primaryColor,
    fontFace: brand.fonts.heading || 'Arial',
  })

  slide3.addShape('line', {
    x: 0.5,
    y: 1,
    w: 9,
    h: 0,
    line: { color: accentColor, width: 2 },
  })

  slide3.addText(
    '• Bullet point 1\n• Bullet point 2\n• Bullet point 3\n• Bullet point 4',
    {
      x: 0.5,
      y: 1.3,
      w: 9,
      h: 3.5,
      fontSize: 18,
      color: '333333',
      fontFace: brand.fonts.body || 'Arial',
      valign: 'top',
      bullet: false,
    }
  )

  // Slide 4: Two Column
  const slide4 = pptx.addSlide({ masterName: 'BRAND_MASTER' })

  slide4.addText('[Two Column Layout]', {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.8,
    fontSize: 32,
    bold: true,
    color: primaryColor,
    fontFace: brand.fonts.heading || 'Arial',
  })

  slide4.addShape('line', {
    x: 0.5,
    y: 1,
    w: 9,
    h: 0,
    line: { color: accentColor, width: 2 },
  })

  // Left column
  slide4.addText('[Left Column Content]', {
    x: 0.5,
    y: 1.3,
    w: 4.25,
    h: 3.5,
    fontSize: 14,
    color: '333333',
    fontFace: brand.fonts.body || 'Arial',
    valign: 'top',
  })

  // Right column
  slide4.addText('[Right Column Content]', {
    x: 5.25,
    y: 1.3,
    w: 4.25,
    h: 3.5,
    fontSize: 14,
    color: '333333',
    fontFace: brand.fonts.body || 'Arial',
    valign: 'top',
  })

  // Slide 5: Thank You
  const slide5 = pptx.addSlide({ masterName: 'BRAND_MASTER' })

  slide5.addShape('rect', {
    x: 0,
    y: 0,
    w: '100%',
    h: '100%',
    fill: { color: primaryColor },
  })

  slide5.addText('Thank You', {
    x: 0.5,
    y: 2,
    w: 9,
    h: 1,
    fontSize: 48,
    bold: true,
    color: 'FFFFFF',
    fontFace: brand.fonts.heading || 'Arial',
    align: 'center',
  })

  slide5.addText(brand.tagline || brand.companyName, {
    x: 0.5,
    y: 3.2,
    w: 9,
    h: 0.5,
    fontSize: 20,
    color: 'FFFFFF',
    fontFace: brand.fonts.body || 'Arial',
    align: 'center',
  })

  // Generate the file
  const blob = (await pptx.write({ outputType: 'blob' })) as Blob
  const prefix = brand.companyName.toLowerCase().replace(/\s+/g, '-')

  return {
    blob,
    fileName: `${prefix}-presentation-template.pptx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    templateType: 'presentation',
  }
}

// ============================================================================
// EXCEL TEMPLATE
// ============================================================================

async function generateXlsxTemplate(brand: BrandConfig): Promise<GeneratedTemplate> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = brand.companyName
  workbook.created = new Date()

  // Parse colors
  const primaryColor = brand.colors.primary.replace('#', '')
  const secondaryColor = brand.colors.secondary.replace('#', '')

  // Create main worksheet
  const sheet = workbook.addWorksheet('Data', {
    headerFooter: {
      oddHeader: `&L${brand.companyName}&C[Document Title]&R&D`,
      oddFooter: `&L${brand.docNumberPrefix || 'DOC'}-SHT-000&C&P of &N&R${brand.companyName}`,
    },
  })

  // Set column widths
  sheet.columns = [
    { header: 'Column A', key: 'colA', width: 20 },
    { header: 'Column B', key: 'colB', width: 20 },
    { header: 'Column C', key: 'colC', width: 20 },
    { header: 'Column D', key: 'colD', width: 20 },
    { header: 'Column E', key: 'colE', width: 20 },
  ]

  // Title row (row 1)
  sheet.mergeCells('A1:E1')
  const titleCell = sheet.getCell('A1')
  titleCell.value = brand.companyName
  titleCell.font = {
    name: brand.fonts.heading || 'Arial',
    size: 18,
    bold: true,
    color: { argb: 'FF' + primaryColor },
  }
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' }
  sheet.getRow(1).height = 30

  // Subtitle row (row 2)
  sheet.mergeCells('A2:E2')
  const subtitleCell = sheet.getCell('A2')
  subtitleCell.value = '[Document Title]'
  subtitleCell.font = {
    name: brand.fonts.body || 'Arial',
    size: 14,
    color: { argb: 'FF' + secondaryColor },
  }
  subtitleCell.alignment = { horizontal: 'left', vertical: 'middle' }
  sheet.getRow(2).height = 25

  // Empty row (row 3)
  sheet.getRow(3).height = 10

  // Header row (row 4)
  const headerRow = sheet.getRow(4)
  headerRow.values = ['Column A', 'Column B', 'Column C', 'Column D', 'Column E']
  headerRow.font = {
    name: brand.fonts.body || 'Arial',
    size: 11,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF' + primaryColor },
  }
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
  headerRow.height = 25

  // Add borders to header
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF' + primaryColor } },
      left: { style: 'thin', color: { argb: 'FF' + primaryColor } },
      bottom: { style: 'thin', color: { argb: 'FF' + primaryColor } },
      right: { style: 'thin', color: { argb: 'FF' + primaryColor } },
    }
  })

  // Add sample data rows with alternating colors
  for (let i = 5; i <= 14; i++) {
    const row = sheet.getRow(i)
    row.values = ['Data', 'Data', 'Data', 'Data', 'Data']
    row.font = {
      name: brand.fonts.body || 'Arial',
      size: 10,
    }
    row.alignment = { horizontal: 'left', vertical: 'middle' }
    row.height = 20

    // Alternating row colors
    if (i % 2 === 0) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF5F5F5' },
      }
    }

    // Add borders
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      }
    })
  }

  // Add totals row
  const totalsRow = sheet.getRow(15)
  totalsRow.values = ['Total', '', '', '', '']
  totalsRow.font = {
    name: brand.fonts.body || 'Arial',
    size: 10,
    bold: true,
  }
  totalsRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF' + secondaryColor.slice(0, 6) + '33' },
  }
  totalsRow.height = 22
  totalsRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF' + primaryColor } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'medium', color: { argb: 'FF' + primaryColor } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    }
  })

  // Generate the file
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const prefix = brand.companyName.toLowerCase().replace(/\s+/g, '-')

  return {
    blob,
    fileName: `${prefix}-spreadsheet-template.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    templateType: 'spreadsheet',
  }
}

// ============================================================================
// UPLOAD TEMPLATES
// ============================================================================

/**
 * Upload generated templates to Supabase Storage and create database records
 */
export async function uploadTemplates(
  templates: GeneratedTemplate[],
  accountId: string,
  userId: string
): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase not configured')
  }

  for (const template of templates) {
    try {
      const storagePath = `${accountId}/templates/${template.fileName}`

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('brands')
        .upload(storagePath, template.blob, {
          contentType: template.mimeType,
          upsert: true,
        })

      if (uploadError) {
        console.error(`[TemplateGenerator] Failed to upload ${template.templateType}:`, uploadError)
        continue
      }

      // Check if template already exists
      const { data: existing } = await supabase
        .from('account_templates')
        .select('id')
        .eq('account_id', accountId)
        .eq('template_type', template.templateType)
        .eq('is_default', true)
        .is('deleted_at', null)
        .single()

      if (existing) {
        // Update existing template
        await supabase
          .from('account_templates')
          .update({
            storage_path: storagePath,
            file_size: template.blob.size,
            updated_by: userId,
          })
          .eq('id', existing.id)
      } else {
        // Create new template record
        await supabase.from('account_templates').insert({
          account_id: accountId,
          template_type: template.templateType,
          template_name: `${template.templateType.charAt(0).toUpperCase() + template.templateType.slice(1)} Template`,
          storage_path: storagePath,
          file_size: template.blob.size,
          mime_type: template.mimeType,
          is_default: true,
          created_by: userId,
          updated_by: userId,
        })
      }

      console.log(`[TemplateGenerator] Uploaded ${template.templateType} template`)
    } catch (error) {
      console.error(`[TemplateGenerator] Error uploading ${template.templateType}:`, error)
    }
  }
}

/**
 * Download a template from storage
 */
export async function downloadTemplate(storagePath: string): Promise<Blob | null> {
  if (!supabase) return null

  try {
    const { data, error } = await supabase.storage.from('brands').download(storagePath)

    if (error) {
      console.error('[TemplateGenerator] Download error:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('[TemplateGenerator] Download failed:', error)
    return null
  }
}

/**
 * Get a signed download URL for a template
 */
export async function getTemplateDownloadUrl(storagePath: string): Promise<string | null> {
  if (!supabase) return null

  try {
    const { data, error } = await supabase.storage
      .from('brands')
      .createSignedUrl(storagePath, 3600) // 1 hour expiry

    if (error) {
      console.error('[TemplateGenerator] Signed URL error:', error)
      return null
    }

    return data.signedUrl
  } catch (error) {
    console.error('[TemplateGenerator] Signed URL failed:', error)
    return null
  }
}
