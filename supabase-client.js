// Shared Supabase connection for the public Puck Bunker site.
// This key is a "publishable" key — it's meant to be public. Real access
// control happens through Row Level Security policies on the database side,
// not by keeping this value secret.
const SUPABASE_URL = "https://bwexpvzstgkllkjaitzy.supabase.co";
const SUPABASE_KEY = "sb_publishable_AqjW7wYPhZ6OTpM1W-jVew_1L18nkZE";

const puckBunkerDB = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
