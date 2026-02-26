export interface Seller {
  name: string;
  email: string;
  code: string | null;
  phone: string;
  session_active: boolean;
  flow_token: string | null;
}
