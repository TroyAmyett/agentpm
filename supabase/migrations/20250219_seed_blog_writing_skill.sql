-- Seed a comprehensive blog-writing skill for Funnelists content agents
-- This gives agents proper context about what Funnelists sells and how to write for the brand

-- Get the Funnelists account ID (the primary account)
DO $$
DECLARE
  v_account_id UUID;
BEGIN
  -- Find the account (try by name first, then just pick the first one)
  SELECT id INTO v_account_id FROM accounts WHERE name ILIKE '%funnelists%' LIMIT 1;
  IF v_account_id IS NULL THEN
    SELECT id INTO v_account_id FROM accounts LIMIT 1;
  END IF;

  IF v_account_id IS NULL THEN
    RAISE NOTICE 'No account found, skipping skill seed';
    RETURN;
  END IF;

  -- Delete existing version if any (idempotent)
  DELETE FROM skills WHERE slug = 'fun-blog-writer' AND account_id = v_account_id;

  -- Insert the blog-writing skill
  INSERT INTO skills (
    account_id,
    name,
    slug,
    description,
    version,
    author,
    tags,
    content,
    category,
    source_type,
    is_enabled,
    is_org_shared,
    namespace,
    tier
  ) VALUES (
    v_account_id,
    'Funnelists Blog Writer',
    'fun-blog-writer',
    'Write SEO-optimized blog posts for funnelists.com that drive traffic and convert readers. Includes brand voice, product context, and publishing workflow.',
    '1.0.0',
    'Funnelists',
    ARRAY['blog', 'content', 'seo', 'marketing', 'writing'],
    E'---\nname: Funnelists Blog Writer\ndescription: Write SEO-optimized blog posts for funnelists.com\ncategory: writing\ntags: [blog, content, seo, marketing]\n---\n\n# Funnelists Blog Writer\n\n## About Funnelists\nFunnelists (funnelists.com) is an AI-powered SaaS platform. Our products:\n- **AgentPM** — AI project manager with autonomous agents\n- **Radar** — Competitive intelligence and source monitoring\n- **Canvas** — AI image generation with brand theming\n- **BookIt** — AI calendar scheduling\n- **TimeChain** — Time tracking and invoicing\n- **LeadGen** — AI lead generation\n\nTarget audience: SMBs, agencies, solopreneurs, marketing teams.\nFounder: Troy Amyett — Salesforce Agentforce Specialist (9 certs), Hollywood FL.\n\n## Brand Voice\n- Professional but approachable\n- Tech-savvy and practical\n- Results-focused (ROI, time saved, deals closed)\n- Emphasis on AI agents doing REAL work, not just chatbots\n- Reference real Funnelists products when relevant\n\n## Blog Post Structure\n1. **Hook** — Start with a compelling problem or statistic\n2. **Context** — Why this matters to SMBs/agencies\n3. **Solution** — How AI/automation solves it (tie to Funnelists products)\n4. **How-to / Details** — Actionable steps or deep-dive\n5. **CTA** — Clear next step (try the product, book a demo, read more)\n\n## SEO Requirements\n- seoTitle: 50-60 chars, include primary keyword\n- metaDescription: 150-160 chars, compelling + keyword\n- Use H2/H3 headings with keywords\n- Include internal links where possible\n- Write 800-1500 words\n\n## Workflow\n1. Research the topic using web_search if needed\n2. Generate a hero image using generate_image (16:9 blog hero)\n3. Write the post in Markdown\n4. Publish using publish_blog_post with the hero image URL\n5. Always set pageType to \"blog\" and category appropriately\n\n## Categories\n- ai-insights — AI trends, agent technology, automation\n- salesforce-ai — Agentforce, Salesforce ecosystem\n- product-updates — Funnelists product news\n- marketing-automation — Marketing strategy with AI\n- case-studies — Customer success stories\n- smb-growth — Small business growth strategies\n\n## DO NOT\n- Write about products we do NOT sell\n- Use generic filler content\n- Skip the hero image\n- Forget SEO metadata\n- Write less than 600 words',
    'writing',
    'local',
    true,
    true,
    '@fun',
    'free'
  );

  RAISE NOTICE 'Blog writing skill seeded for account %', v_account_id;
END $$;
