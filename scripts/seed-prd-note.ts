#!/usr/bin/env npx ts-node

/**
 * Seed Script: Add PRD to Notes
 *
 * This script adds the Project Management PRD document to the notes table.
 *
 * Usage:
 *   npx ts-node scripts/seed-prd-note.ts
 *
 * Or with environment variables:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npx ts-node scripts/seed-prd-note.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: Missing Supabase credentials')
  console.error('Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Convert markdown to TipTap JSON format
function markdownToTipTapJson(markdown: string): object {
  const lines = markdown.split('\n')
  const content: object[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Skip empty lines
    if (!line.trim()) {
      i++
      continue
    }

    // Headings
    if (line.startsWith('# ')) {
      content.push({
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: line.slice(2) }],
      })
    } else if (line.startsWith('## ')) {
      content.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: line.slice(3) }],
      })
    } else if (line.startsWith('### ')) {
      content.push({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: line.slice(4) }],
      })
    }
    // Horizontal rule
    else if (line.startsWith('---')) {
      content.push({ type: 'horizontalRule' })
    }
    // Code blocks
    else if (line.startsWith('```')) {
      const codeLines: string[] = []
      const lang = line.slice(3).trim()
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      content.push({
        type: 'codeBlock',
        attrs: { language: lang || null },
        content: [{ type: 'text', text: codeLines.join('\n') }],
      })
    }
    // Bullet list items
    else if (line.match(/^[-*]\s/)) {
      const listItems: object[] = []
      while (i < lines.length && lines[i].match(/^[-*]\s/)) {
        const itemText = lines[i].replace(/^[-*]\s/, '')
        listItems.push({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: itemText }],
          }],
        })
        i++
      }
      content.push({
        type: 'bulletList',
        content: listItems,
      })
      continue // Skip the i++ at the end
    }
    // Numbered list items
    else if (line.match(/^\d+\.\s/)) {
      const listItems: object[] = []
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        const itemText = lines[i].replace(/^\d+\.\s/, '')
        listItems.push({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: itemText }],
          }],
        })
        i++
      }
      content.push({
        type: 'orderedList',
        content: listItems,
      })
      continue // Skip the i++ at the end
    }
    // Task list items (checkboxes)
    else if (line.match(/^- \[[ x]\]/i)) {
      const listItems: object[] = []
      while (i < lines.length && lines[i].match(/^- \[[ x]\]/i)) {
        const isChecked = lines[i].includes('[x]') || lines[i].includes('[X]')
        const itemText = lines[i].replace(/^- \[[ x]\]\s*/i, '')
        listItems.push({
          type: 'taskItem',
          attrs: { checked: isChecked },
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: itemText }],
          }],
        })
        i++
      }
      content.push({
        type: 'taskList',
        content: listItems,
      })
      continue // Skip the i++ at the end
    }
    // Regular paragraph
    else {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      })
    }

    i++
  }

  return {
    type: 'doc',
    content,
  }
}

async function main() {
  console.log('🌱 Seeding PRD note...\n')

  // Read the PRD markdown file
  const prdPath = path.join(__dirname, '..', 'docs', 'PRD-ProjectManagement-v1.md')

  if (!fs.existsSync(prdPath)) {
    console.error(`Error: PRD file not found at ${prdPath}`)
    process.exit(1)
  }

  const prdContent = fs.readFileSync(prdPath, 'utf-8')
  console.log(`📄 Read PRD file (${prdContent.length} characters)`)

  // Get the user's account
  // First, get a user from user_accounts
  const { data: userAccounts, error: userAccountsError } = await supabase
    .from('user_accounts')
    .select('user_id, account_id')
    .limit(1)
    .single()

  if (userAccountsError || !userAccounts) {
    console.error('Error: No user accounts found. Please sign in to the app first.')
    console.error(userAccountsError)
    process.exit(1)
  }

  const { user_id: userId, account_id: accountId } = userAccounts
  console.log(`👤 Found user account: ${accountId}`)

  // Convert markdown to TipTap JSON
  const tiptapContent = markdownToTipTapJson(prdContent)
  console.log('📝 Converted markdown to TipTap format')

  // Check if note already exists
  const { data: existingNote } = await supabase
    .from('notes')
    .select('id')
    .eq('user_id', userId)
    .eq('title', 'PRD: Project Management & Automation System')
    .single()

  if (existingNote) {
    console.log('⚠️  Note already exists, updating...')

    const { error: updateError } = await supabase
      .from('notes')
      .update({
        content: tiptapContent,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingNote.id)

    if (updateError) {
      console.error('Error updating note:', updateError)
      process.exit(1)
    }

    console.log(`✅ Updated existing note: ${existingNote.id}`)
  } else {
    // Create the note
    const { data: newNote, error: insertError } = await supabase
      .from('notes')
      .insert({
        user_id: userId,
        title: 'PRD: Project Management & Automation System',
        content: tiptapContent,
        folder_id: null, // Root folder
        entity_type: 'prd',
        entity_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating note:', insertError)
      process.exit(1)
    }

    console.log(`✅ Created new note: ${newNote.id}`)
  }

  console.log('\n🎉 Done! The PRD has been added to your notes.')
}

main().catch(console.error)
