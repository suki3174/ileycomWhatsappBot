export interface Seller {
  user_id?: number;
  name: string;
  email: string;
  code: string | null;
  phone: string;
  flow_token: string | null;
  reset_token?: string | null;
  reset_token_expiry?: number | null;
  session_active_until?: number | null;
  auth_portal_sent_at?: number | null;
}