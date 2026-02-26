import type { Seller } from "@/models/seller.model";

// const sellers: Seller[] = [
  // {
  //   name: "Sara",
  //   email: "sara.kal2004@gmail.com",
  //   code: "1234",
  //   phone: "21628997072",
  //   session_active: false,
  //   flow_token: null,
  // },
// ];
declare global {
  var sellers: Seller[] | undefined;
}

globalThis.sellers = globalThis.sellers || [ {
    name: "Sara",
    email: "sara.kal2004@gmail.com",
    code: "1234",
    phone: "21628997072",
    session_active: false,
    flow_token: null,
  },];

export const sellers: Seller[] = globalThis.sellers;

export function findAllSellers(): Seller[] {
  return sellers;
}

export function findSellerByPhone(phone: string): Seller | undefined {

  return sellers.find((seller) => seller.phone === phone);
}

export function findSellerByFlowToken(token: string): Seller | undefined {
  const tok = String(token || "").trim();
  return sellers.find((seller) => {
    const sTok = seller.flow_token == null ? "" : String(seller.flow_token).trim();
    return sTok === tok;
  });
}
export function updateSellerCode(
  token: string,
  code: string,
): Seller | undefined {
  const seller = findSellerByFlowToken(token);
  if (seller) {
    seller.code = code;
    return seller;
  }
  return undefined;
}




export function activateSellerSession(token:string): boolean {
   const seller = findSellerByFlowToken(token);
  if (!seller) return false;

  seller.session_active_until = Date.now() + 24 * 60 * 60 * 1000; // 24h

  return true;
}

export function deactivateSellerSession(token : string): Seller | undefined {
  const seller = findSellerByFlowToken(token);
  if (seller) {
    seller.session_active = false;
    return seller;
  }
  return undefined;
}


export function setResetToken(
  email: string,
  token: string,
  expiry: number
): Seller | undefined {
  const seller = sellers.find(s => String(s.email || "").toLowerCase() === String(email || "").toLowerCase());

  if (seller) {
    seller.reset_token = token;
    seller.reset_token_expiry = expiry;
    return seller;
  }

  return undefined;
}