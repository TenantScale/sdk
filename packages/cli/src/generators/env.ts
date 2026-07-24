/*
 * MIT License
 *
 * Copyright (c) 2026 TenantScale
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// ──────────────────────────────────────────────────────
// @tenantscale/cli — Environment Template Generator
// ──────────────────────────────────────────────────────

export interface EnvResult {
  files: { path: string; content: string; description: string }[]
}

/**
 * Generate .env template and configuration files.
 */
export function generateEnvConfig(outputDir: string): EnvResult {
  return {
    files: [
      {
        path: `${outputDir}/.env.tenantscale`,
        description: 'TenantScale environment variables template',
        content: `# TenantScale Configuration
# Copy these variables to your .env file

# Supabase (required)
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# TenantScale API (optional — for cloud features)
TENANTSCALE_API_KEY=your_tenantscale_api_key

# Stripe (optional — for plan enforcement + billing)
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret

# Rate Limiting
RATE_LIMIT_ENABLED=true
`,
      },
      {
        path: `${outputDir}/TENANTSCALE_CONFIG.md`,
        description: 'Configuration guide',
        content: `# TenantScale Configuration Guide

## Environment Variables

### Required

- \`SUPABASE_URL\` — Your Supabase project URL (https://app.supabase.com → Settings → API)
- \`SUPABASE_SERVICE_ROLE_KEY\` — Your Supabase service_role key (bypasses RLS for admin operations)

### Optional

- \`TENANTSCALE_API_KEY\` — If using TenantScale Cloud for analytics dashboard
- \`STRIPE_SECRET_KEY\` — Needed for plan enforcement and billing features
- \`STRIPE_WEBHOOK_SECRET\` — For Stripe subscription status changes
- \`RATE_LIMIT_ENABLED\` — Set to "false" to disable rate limiting during development

## Next Steps

1. Copy .env.tenantscale to your project root as .env
2. Fill in your Supabase project credentials
3. Run the SQL migrations in numeric order
4. Import the generated middleware into your app
5. Test with a tenant API key: \`curl -H "x-api-key: <key>" http://localhost:3000/api/your-endpoint\`

## Verify It Works

\`\`\`bash
# Generate a test API key (via your app)
curl -X POST http://localhost:3000/api/keys \\
  -H "Content-Type: application/json" \\
  -d '{"label": "test"}'

# Use the key
curl http://localhost:3000/api/projects \\
  -H "x-api-key: ts_xxxxxx_xxxxxx"
\`\`\`
`,
      },
    ],
  }
}
