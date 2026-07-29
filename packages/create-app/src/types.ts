export interface ScaffoldOptions {
  projectName: string
  targetDir: string
  templateTier: 'minimal' | 'example' | 'full'
  framework: string
  language: 'typescript' | 'javascript'
  packageManager: 'pnpm' | 'npm' | 'yarn'
  supabaseUrl?: string
  supabaseKey?: string
  stripeKey?: string
  tenantColumn?: string
}

export interface PromptResults {
  projectName: string
  templateTier: 'minimal' | 'example' | 'full'
  framework: string
  language: 'typescript' | 'javascript'
  packageManager: 'pnpm' | 'npm' | 'yarn'
  supabase: 'skip' | 'enter'
  supabaseUrl?: string
  supabaseKey?: string
  stripe: boolean
  stripeKey?: string
  tenantColumn: string
  gitInit: boolean
  runInstall: boolean
}
