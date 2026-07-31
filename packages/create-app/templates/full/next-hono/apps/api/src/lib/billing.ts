import { supabase } from '../db.js'

/**
 * Resolve the Stripe customer ID for a tenant, creating one if needed.
 * Assumes a `stripe_customer_id` column on the `tenants` table.
 */
export async function getCustomerId(tenantId: string): Promise<string> {
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('stripe_customer_id')
    .eq('id', tenantId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load tenant: ${error.message}`)
  }

  if (tenant?.stripe_customer_id) {
    return tenant.stripe_customer_id
  }

  // No customer yet — this template leaves the Stripe customer creation
  // to your billing flow (e.g. create it on first checkout). Returning an
  // empty id here makes the failure explicit rather than silent.
  throw new Error(
    'No Stripe customer for this tenant. Create the customer during checkout and store stripe_customer_id on the tenants row.',
  )
}
