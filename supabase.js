const supabaseUrl = "https://ntfglwfrhljjkzecifuh.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50Zmdsd2ZyaGxqamt6ZWNpZnVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1OTEyNTYsImV4cCI6MjA4ODE2NzI1Nn0.xVC4IFBD72prT7KS-jiHlRQixVrR81QUVX2av_jU7uM";

// We use _supabase to ensure it doesn't clash with the window.supabase object
window.db = window.supabase.createClient(supabaseUrl, supabaseKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
