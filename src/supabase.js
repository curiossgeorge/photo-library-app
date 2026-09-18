import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://smbhjcjhhypfbkvfpprc.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtYmhqY2poaHlwZmJrdmZwcHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NTg0NjIsImV4cCI6MjEwNTMzNDQ2Mn0.E-QGhflSdd8D1McoHS3JiFfy421V6hobuIBCOxqdEUU'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
