import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sdfdnxgxbxxbyofmeyzo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkZmRueGd4Ynh4YnlvZm1leXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MzU4NzcsImV4cCI6MjEwMjAxMTg3N30.7lxF0p8thwogFvfya2eMxWMBBmIUQvt9HofjdpEKSIo';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testFetch() {
  const { data: entries, error } = await supabase
    .from('diary_entries')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Fetch error:', error);
    return;
  }

  console.log(`Found ${entries?.length || 0} entries in diary_entries:`);
  entries?.forEach((e) => {
    console.log(`ID: ${e.id} | Created: ${e.created_at} | Voice: ${e.voice_url ? 'YES' : 'NO'} | Trans: "${e.transcription}"`);
  });
}

testFetch();
