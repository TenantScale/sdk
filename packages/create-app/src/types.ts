export interface ScaffoldOptions {
  projectName: string
  targetDir: string
  templateTier: 'minimal' | 'example' | 'full'
  framework: string
  language: 'typescript' | 'javascript'
  packageManager: 'pnpm' | 'npm' | 'yarn'
  supabaseUrl?: string
  supabaseAnonKey?: string
  supabaseServiceKey?: string
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
  supabaseAnonKey?: string
  supabaseServiceKey?: string
  stripe: boolean
  stripeKey?: string
  tenantColumn: string
  gitInit: boolean
  runInstall: boolean
}
