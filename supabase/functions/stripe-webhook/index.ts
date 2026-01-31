// Stripe Webhook Edge Function
// Handles Stripe webhook events for payment tracking

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@11.16.0?target=deno'

serve(async (req) => {
  try {
    // Initialize Stripe
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

    if (!stripeSecretKey || !stripeWebhookSecret) {
      throw new Error('Stripe configuration missing')
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify webhook signature
    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      return new Response('Missing signature', { status: 400 })
    }

    const body = await req.text()
    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret)
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return new Response('Invalid signature', { status: 400 })
    }

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        // Update checkout session in database
        const { error: updateError } = await supabase
          .from('checkout_sessions')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            amount_total: session.amount_total,
            customer_email: session.customer_email || session.customer_details?.email,
          })
          .eq('stripe_session_id', session.id)

        if (updateError) {
          console.error('Error updating checkout session:', updateError)
        }

        // Update funnel session if we have metadata
        const metadata = session.metadata || {}
        if (metadata.funnelId) {
          // Find the funnel session by looking at recent leads with this funnel
          const { data: checkoutData } = await supabase
            .from('checkout_sessions')
            .select('funnel_session_id, landing_page_slug')
            .eq('stripe_session_id', session.id)
            .single()

          if (checkoutData?.funnel_session_id) {
            await supabase
              .from('funnel_sessions')
              .update({
                converted: true,
                conversion_type: 'purchase',
                conversion_value: (session.amount_total || 0) / 100,
                conversion_page_slug: checkoutData.landing_page_slug,
                completed_at: new Date().toISOString(),
              })
              .eq('id', checkoutData.funnel_session_id)
          }

          // Also update any lead from this funnel
          const customerEmail = session.customer_email || session.customer_details?.email
          if (customerEmail) {
            await supabase
              .from('leads')
              .update({
                converted_at: new Date().toISOString(),
                conversion_type: 'purchase',
                conversion_value: (session.amount_total || 0) / 100,
              })
              .eq('email', customerEmail)
              .eq('funnel_id', metadata.funnelId)
              .is('converted_at', null)
          }
        }

        console.log(`Checkout completed: ${session.id}`)
        break
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session

        await supabase
          .from('checkout_sessions')
          .update({ status: 'expired' })
          .eq('stripe_session_id', session.id)

        console.log(`Checkout expired: ${session.id}`)
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.log(`Payment failed: ${paymentIntent.id}`)
        // Could send notification or update status
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
