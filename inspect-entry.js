import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sdfdnxgxbxxbyofmeyzo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkZmRueGd4Ynh4YnlvZm1leXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MzU4NzcsImV4cCI6MjEwMjAxMTg3N30.7lxF0p8thwogFvfya2eMxWMBBmIUQvt9HofjdpEKSIo';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectEntry() {
  const { data } = await supabase.from('diary_entries').select('*').eq('id', '12e1df35-59fa-44dc-ac2b-cfb3820729d4').single();
  console.log('Voice URL starts with:', data?.voice_url ? data.voice_url.substring(0, 100) : 'null');
  console.log('Voice URL length:', data?.voice_url?.length || 0);
}
inspectEntry();
