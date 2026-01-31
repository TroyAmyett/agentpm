// Create Stripe Checkout Session Edge Function
// Creates a Stripe Checkout session for landing page purchases

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@11.16.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CheckoutRequest {
  priceId: string
  pageSlug?: string
  funnelId?: string
  tierId?: string
  customerEmail?: string
  successUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Stripe
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY not configured')
    }
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request
    const body: CheckoutRequest = await req.json()

    if (!body.priceId || !body.successUrl || !body.cancelUrl) {
      return new Response(
        JSON.stringify({ error: 'priceId, successUrl, and cancelUrl are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Look up the price to determine checkout mode (subscription vs one-time)
    const price = await stripe.prices.retrieve(body.priceId)
    const mode = price.type === 'recurring' ? 'subscription' : 'payment'

    // Look up landing page for account_id
    let accountId: string | null = null
    if (body.pageSlug) {
      const { data: landingPage } = await supabase
        .from('landing_pages')
        .select('account_id')
        .eq('slug', body.pageSlug)
        .single()
      accountId = landingPage?.account_id
    }
    accountId = accountId || Deno.env.get('DEFAULT_ACCOUNT_ID') || null

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode,
      payment_method_types: ['card'],
      line_items: [
        {
          price: body.priceId,
          quantity: 1,
        },
      ],
      success_url: body.successUrl + '?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: body.cancelUrl,
      customer_email: body.customerEmail,
      metadata: {
        pageSlug: body.pageSlug || '',
        funnelId: body.funnelId || '',
        tierId: body.tierId || '',
        ...body.metadata,
      },
    })

    // Store checkout session in database for tracking
    const { error: insertError } = await supabase
      .from('checkout_sessions')
      .insert({
        account_id: accountId,
        stripe_session_id: session.id,
        stripe_price_id: body.priceId,
        landing_page_slug: body.pageSlug,
        funnel_id: body.funnelId,
        customer_email: body.customerEmail,
        status: 'pending',
        amount_total: session.amount_total,
        currency: session.currency,
        metadata: {
          tierId: body.tierId,
          successUrl: body.successUrl,
          cancelUrl: body.cancelUrl,
        },
      })

    if (insertError) {
      console.error('Error storing checkout session:', insertError)
      // Non-fatal - continue with checkout
    }

    // Return session ID for client-side redirect
    return new Response(
      JSON.stringify({
        sessionId: session.id,
        url: session.url,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Checkout session error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
